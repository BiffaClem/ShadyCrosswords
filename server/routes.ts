import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth";
import fs from "fs";
import path from "path";

// Track active WebSocket connections per session
const sessionConnections = new Map<string, Set<WebSocket>>();

// Helper functions for calculating puzzle stats
function countWhiteCells(grid: string[]): number {
  return grid.reduce((count, row) => {
    return count + row.split('').filter(c => c === '.').length;
  }, 0);
}

function countFilledCells(grid: string[][]): number {
  return grid.reduce((count, row) => {
    return count + row.filter(c => c && c !== '').length;
  }, 0);
}

function countCorrectCells(userGrid: string[][], puzzleData: any): number {
  if (!userGrid.length || !puzzleData.clues) return 0;
  
  const correctCells = new Set<string>();
  
  // Process across clues
  for (const clue of puzzleData.clues.across || []) {
    for (let i = 0; i < clue.length; i++) {
      const row = clue.row - 1;
      const col = clue.col - 1 + i;
      
      if (userGrid[row] && userGrid[row][col]) {
        const userVal = userGrid[row][col];
        const expectedVal = clue.answer[i];
        if (userVal === expectedVal) {
          correctCells.add(`${row}-${col}`);
        }
      }
    }
  }
  
  // Process down clues
  for (const clue of puzzleData.clues.down || []) {
    for (let i = 0; i < clue.length; i++) {
      const row = clue.row - 1 + i;
      const col = clue.col - 1;
      
      if (userGrid[row] && userGrid[row][col]) {
        const userVal = userGrid[row][col];
        const expectedVal = clue.answer[i];
        if (userVal === expectedVal) {
          correctCells.add(`${row}-${col}`);
        }
      }
    }
  }
  
  return correctCells.size;
}

// Load puzzles from the puzzles folder into the database
async function loadPuzzlesFromFolder() {
  const puzzlesDir = path.join(process.cwd(), "puzzles");
  
  if (!fs.existsSync(puzzlesDir)) {
    console.log("No puzzles folder found, skipping puzzle loading");
    return;
  }
  
  const files = fs.readdirSync(puzzlesDir).filter(f => f.endsWith(".json"));
  console.log(`Found ${files.length} puzzle files to load`);
  
  for (const file of files) {
    try {
      const filePath = path.join(puzzlesDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const puzzleData = JSON.parse(content);
      
      // Check if already exists
      const existing = await storage.getPuzzleByPuzzleId(puzzleData.puzzleId);
      if (!existing) {
        await storage.createPuzzle({
          puzzleId: puzzleData.puzzleId,
          title: puzzleData.title || file.replace(".json", ""),
          data: puzzleData,
          uploadedBy: null,
        });
        console.log(`Loaded puzzle: ${puzzleData.title || file}`);
      }
    } catch (error) {
      console.error(`Failed to load puzzle ${file}:`, error);
    }
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup authentication
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Load puzzles from folder
  await loadPuzzlesFromFolder();

  // Get all puzzles with user's session stats
  app.get("/api/puzzles", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const puzzles = await storage.getAllPuzzles();
      const sessions = await storage.getUserSessions(userId);
      
      // Enrich puzzles with session info
      const enrichedPuzzles = await Promise.all(puzzles.map(async (puzzle) => {
        const puzzleSessions = sessions.filter(s => s.puzzleId === puzzle.id);
        
        // Calculate stats for each session
        const sessionsWithStats = await Promise.all(puzzleSessions.map(async (session) => {
          const progress = await storage.getProgress(session.id);
          const participants = await storage.getSessionParticipantsWithUsers(session.id);
          const puzzleData = puzzle.data as any;
          const totalCells = countWhiteCells(puzzleData.grid);
          const userGrid = (progress?.grid as string[][] | null) || [];
          const filledCells = countFilledCells(userGrid);
          const correctCells = countCorrectCells(userGrid, puzzleData);
          
          return {
            ...session,
            percentComplete: totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0,
            percentCorrect: filledCells > 0 ? Math.round((correctCells / filledCells) * 100) : 0,
            participants,
          };
        }));
        
        return {
          ...puzzle,
          sessions: sessionsWithStats,
        };
      }));
      
      res.json(enrichedPuzzles);
    } catch (error) {
      console.error("Error fetching puzzles:", error);
      res.status(500).json({ message: "Failed to fetch puzzles" });
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
      const { puzzleId, name, isCollaborative, difficulty, invitees } = req.body;

      // Verify puzzle exists
      const puzzle = await storage.getPuzzle(puzzleId);
      if (!puzzle) {
        res.status(404).json({ message: "Puzzle not found" });
        return;
      }

      // Validate difficulty
      const validDifficulties = ["beginner", "standard", "expert"];
      const sessionDifficulty = validDifficulties.includes(difficulty) ? difficulty : "standard";

      const session = await storage.createSession({
        puzzleId,
        ownerId: userId,
        name: name || `${puzzle.title} - ${new Date().toLocaleDateString()}`,
        isCollaborative: isCollaborative || false,
        difficulty: sessionDifficulty,
      });

      // Add owner as participant so their activity is tracked
      await storage.addParticipant({
        sessionId: session.id,
        userId,
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

      // Create invites for selected users
      if (invitees && Array.isArray(invitees) && invitees.length > 0) {
        const inviteRecords = invitees.map((invitedUserId: string) => ({
          sessionId: session.id,
          invitedUserId,
          invitedById: userId,
          status: "pending",
        }));
        await storage.createInvites(inviteRecords);
      }

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

      // Update participant activity
      await storage.updateParticipantActivity(session.id, userId);

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

  // Get session participants with activity info
  app.get("/api/sessions/:id/participants", isAuthenticated, async (req: any, res) => {
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

      // Get all participants with activity (includes owner since they're added as participant)
      const participants = await storage.getSessionParticipantsWithActivity(session.id);
      
      // Mark which one is the owner
      const enrichedParticipants = participants.map(p => ({
        ...p,
        isOwner: p.id === session.ownerId,
      }));
      
      res.json({
        ownerId: session.ownerId,
        participants: enrichedParticipants,
      });
    } catch (error) {
      console.error("Error fetching participants:", error);
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  // Get all users (for invite selection)
  app.get("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const allUsers = await storage.getAllUsers();
      // Exclude current user from list
      const users = allUsers.filter(u => u.id !== currentUserId);
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get invites for current user
  app.get("/api/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const invites = await storage.getInvitesForUser(userId);
      
      // Enrich with session and puzzle info
      const enrichedInvites = await Promise.all(invites.map(async (invite) => {
        const session = await storage.getSession(invite.sessionId);
        if (!session) return null;
        const puzzle = await storage.getPuzzle(session.puzzleId);
        return {
          ...invite,
          sessionName: session.name,
          puzzleTitle: puzzle?.title,
          puzzleId: puzzle?.puzzleId,
        };
      }));
      
      res.json(enrichedInvites.filter(Boolean));
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  // Respond to an invite (accept/decline)
  app.post("/api/invites/:id/respond", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { status } = req.body;
      
      if (!["accepted", "declined"].includes(status)) {
        res.status(400).json({ message: "Invalid status" });
        return;
      }
      
      const invite = await storage.getInvite(req.params.id);
      if (!invite) {
        res.status(404).json({ message: "Invite not found" });
        return;
      }
      
      if (invite.invitedUserId !== userId) {
        res.status(403).json({ message: "Access denied" });
        return;
      }
      
      const updated = await storage.updateInviteStatus(req.params.id, status);
      
      // If accepted, add user as participant
      if (status === "accepted") {
        const isAlreadyParticipant = await storage.isParticipant(invite.sessionId, userId);
        if (!isAlreadyParticipant) {
          await storage.addParticipant({
            sessionId: invite.sessionId,
            userId,
          });
        }
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error responding to invite:", error);
      res.status(500).json({ message: "Failed to respond to invite" });
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
