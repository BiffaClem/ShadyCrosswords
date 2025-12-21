import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";

// Track active WebSocket connections per session
const sessionConnections = new Map<string, Set<WebSocket>>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication
  await setupAuth(app);
  registerAuthRoutes(app);

  // Get all puzzles
  app.get("/api/puzzles", isAuthenticated, async (req, res) => {
    try {
      const puzzles = await storage.getAllPuzzles();
      res.json(puzzles);
    } catch (error) {
      console.error("Error fetching puzzles:", error);
      res.status(500).json({ message: "Failed to fetch puzzles" });
    }
  });

  // Upload a puzzle
  app.post("/api/puzzles", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const puzzleData = req.body;
      
      // Check if puzzle already exists
      const existing = await storage.getPuzzleByPuzzleId(puzzleData.puzzleId);
      if (existing) {
        res.json(existing);
        return;
      }

      const puzzle = await storage.createPuzzle({
        puzzleId: puzzleData.puzzleId,
        title: puzzleData.title,
        data: puzzleData,
        uploadedBy: userId,
      });
      res.json(puzzle);
    } catch (error) {
      console.error("Error creating puzzle:", error);
      res.status(500).json({ message: "Failed to create puzzle" });
    }
  });

  // Get user's sessions
  app.get("/api/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const sessions = await storage.getUserSessions(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  // Get a specific session with puzzle data
  app.get("/api/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        res.status(404).json({ message: "Session not found" });
        return;
      }

      // Check access
      const isOwner = session.ownerId === userId;
      let isParticipant = await storage.isParticipant(session.id, userId);
      
      // Auto-join collaborative sessions
      if (!isOwner && !isParticipant) {
        if (session.isCollaborative) {
          try {
            await storage.addParticipant({
              sessionId: session.id,
              userId,
            });
          } catch (e) {
            // Ignore duplicate participant errors - user may already be added
          }
          isParticipant = true;
        } else {
          res.status(403).json({ message: "Access denied" });
          return;
        }
      }

      const puzzle = await storage.getPuzzle(session.puzzleId);
      const progress = await storage.getProgress(session.id);
      const participants = await storage.getSessionParticipants(session.id);

      res.json({ session, puzzle, progress, participants });
    } catch (error) {
      console.error("Error fetching session:", error);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  // Create a new session
  app.post("/api/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { puzzleId, name, isCollaborative } = req.body;

      // Verify puzzle exists
      const puzzle = await storage.getPuzzle(puzzleId);
      if (!puzzle) {
        res.status(404).json({ message: "Puzzle not found" });
        return;
      }

      const session = await storage.createSession({
        puzzleId,
        ownerId: userId,
        name: name || `${puzzle.title} - ${new Date().toLocaleDateString()}`,
        isCollaborative: isCollaborative || false,
      });

      // Initialize empty progress
      const rows = (puzzle.data as any).size.rows;
      const cols = (puzzle.data as any).size.cols;
      const emptyGrid = Array(rows).fill(null).map(() => Array(cols).fill(""));
      
      await storage.saveProgress({
        sessionId: session.id,
        grid: emptyGrid,
        updatedBy: userId,
      });

      res.json(session);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  // Join a collaborative session
  app.post("/api/sessions/:id/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.id);

      if (!session) {
        res.status(404).json({ message: "Session not found" });
        return;
      }

      if (!session.isCollaborative) {
        res.status(403).json({ message: "This is not a collaborative session" });
        return;
      }

      // Check if already a participant
      const isAlreadyParticipant = await storage.isParticipant(session.id, userId);
      if (!isAlreadyParticipant && session.ownerId !== userId) {
        await storage.addParticipant({
          sessionId: session.id,
          userId,
        });
      }

      res.json({ message: "Joined session" });
    } catch (error) {
      console.error("Error joining session:", error);
      res.status(500).json({ message: "Failed to join session" });
    }
  });

  // Save progress
  app.post("/api/sessions/:id/progress", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getSession(req.params.id);

      if (!session) {
        res.status(404).json({ message: "Session not found" });
        return;
      }

      // Check access
      const isOwner = session.ownerId === userId;
      const isParticipant = await storage.isParticipant(session.id, userId);
      
      if (!isOwner && !isParticipant) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const { grid } = req.body;
      const progress = await storage.saveProgress({
        sessionId: session.id,
        grid,
        updatedBy: userId,
      });

      // Broadcast to other participants via WebSocket
      broadcastToSession(session.id, {
        type: "progress_update",
        grid,
        updatedBy: userId,
      });

      res.json(progress);
    } catch (error) {
      console.error("Error saving progress:", error);
      res.status(500).json({ message: "Failed to save progress" });
    }
  });

  // WebSocket setup for real-time collaboration
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws, req) => {
    let sessionId: string | null = null;
    let userId: string | null = null;

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "join_session") {
          sessionId = data.sessionId;
          userId = data.userId;

          if (!sessionConnections.has(sessionId!)) {
            sessionConnections.set(sessionId!, new Set());
          }
          sessionConnections.get(sessionId!)!.add(ws);

          // Notify others
          broadcastToSession(sessionId!, {
            type: "user_joined",
            userId,
          }, ws);
        }

        if (data.type === "cell_update" && sessionId) {
          // Broadcast cell update to other participants
          broadcastToSession(sessionId, {
            type: "cell_update",
            row: data.row,
            col: data.col,
            value: data.value,
            userId,
          }, ws);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      if (sessionId && sessionConnections.has(sessionId)) {
        sessionConnections.get(sessionId)!.delete(ws);
        
        // Notify others
        broadcastToSession(sessionId, {
          type: "user_left",
          userId,
        });

        if (sessionConnections.get(sessionId)!.size === 0) {
          sessionConnections.delete(sessionId);
        }
      }
    });
  });

  return httpServer;
}

function broadcastToSession(sessionId: string, data: any, exclude?: WebSocket) {
  const connections = sessionConnections.get(sessionId);
  if (!connections) return;

  const message = JSON.stringify(data);
  connections.forEach((ws) => {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}
