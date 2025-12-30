import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, registerAuthRoutes, requireAdmin, authStorage } from "./auth";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import type { PuzzleSession } from "@shared/schema";

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

function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed.includes("@")) return null;
  return trimmed;
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

  // Get all puzzles with all session stats (visible to all users)
  app.get("/api/puzzles", isAuthenticated, async (req: any, res) => {
    try {
      const puzzles = await storage.getAllPuzzles();
      const allSessions = await storage.getAllSessions();
      
      // Group sessions by puzzle
      const sessionsByPuzzle = new Map<string, PuzzleSession[]>();
      allSessions.forEach(session => {
        if (!sessionsByPuzzle.has(session.puzzleId)) {
          sessionsByPuzzle.set(session.puzzleId, []);
        }
        sessionsByPuzzle.get(session.puzzleId)!.push(session);
      });
      
      // Enrich puzzles with session info
      const enrichedPuzzles = await Promise.all(puzzles.map(async (puzzle) => {
        const puzzleSessions = sessionsByPuzzle.get(puzzle.id) || [];
        
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
            submittedAt: progress?.submittedAt || null,
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
      const userId = req.user.id;
      const sessions = await storage.getUserSessions(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  // Get recent user activity across all sessions
  app.get("/api/activity", isAuthenticated, async (req: any, res) => {
    try {
      const recentActivity = await storage.getRecentUserActivity();
      res.json(recentActivity);
    } catch (error) {
      console.error("Error fetching activity:", error);
      res.status(500).json({ message: "Failed to fetch activity" });
    }
  });

  // Get a specific session with puzzle data
  app.get("/api/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        res.status(404).json({ message: "Session not found" });
        return;
      }

      // Allow access to all collaborative sessions - auto-add as participant
      if (session.isCollaborative) {
        const isAlreadyParticipant = await storage.isParticipant(session.id, userId);
        if (!isAlreadyParticipant && session.ownerId !== userId) {
          try {
            await storage.addParticipant({
              sessionId: session.id,
              userId,
            });
          } catch (e) {
            // Ignore duplicate participant errors - user may already be added
          }
        }
      } else {
        // For private sessions, only allow owner
        if (session.ownerId !== userId) {
          res.status(403).json({ message: "Access denied - this is a private session" });
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
      const userId = req.user.id;
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
      const userId = req.user.id;
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

  // Delete a session (owner or admin)
  app.delete("/api/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const session = await storage.getSession(req.params.id);

      if (!session) {
        res.status(404).json({ message: "Session not found" });
        return;
      }

      const isAdmin = req.user?.role === "admin";
      if (session.ownerId !== userId && !isAdmin) {
        res.status(403).json({ message: "Only the session owner or an admin can delete this session" });
        return;
      }

      await storage.deleteSession(session.id);
      res.json({ message: "Session deleted" });
    } catch (error) {
      console.error("Error deleting session:", error);
      res.status(500).json({ message: "Failed to delete session" });
    }
  });

  // Submit a session (marks it as complete)
  app.post("/api/sessions/:id/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
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

      // Check if already submitted
      const existingProgress = await storage.getProgress(session.id);
      if (existingProgress?.submittedAt) {
        res.status(400).json({ message: "Already submitted" });
        return;
      }

      const progress = await storage.submitSession(session.id);
      
      // Broadcast to other participants via WebSocket
      broadcastToSession(session.id, {
        type: "session_submitted",
      });

      res.json(progress);
    } catch (error) {
      console.error("Error submitting session:", error);
      res.status(500).json({ message: "Failed to submit session" });
    }
  });

  // Save progress
  app.post("/api/sessions/:id/progress", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
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

      // Check if already submitted
      const existingProgress = await storage.getProgress(session.id);
      if (existingProgress?.submittedAt) {
        res.status(403).json({ message: "Cannot update submitted crossword" });
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
      const userId = req.user.id;
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
      const currentUserId = req.user.id;
      const allUsers = await storage.getAllUsers();
      // Exclude current user from list
      const users = allUsers
        .filter(u => u.id !== currentUserId)
        .map(({ id, firstName, email }) => ({ id, firstName, email }));
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update current user profile
  app.patch("/api/users/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { firstName } = req.body;
      
      if (typeof firstName !== "string" || firstName.trim().length === 0) {
        res.status(400).json({ message: "Invalid first name" });
        return;
      }
      
      const updatedUser = await storage.updateUser(userId, { firstName: firstName.trim() });
      if (!updatedUser) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Get invites for current user
  app.get("/api/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
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
      const userId = req.user.id;
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

  // Admin: list users
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching admin users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Admin: update user by allowed email ID (universal method)
  app.patch("/api/admin/people/:id", requireAdmin, async (req: any, res) => {
    try {
      const allowedRoles = ["admin", "user"];
      const role = typeof req.body?.role === "string" ? req.body.role : undefined;
      const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : undefined;

      if (role && !allowedRoles.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // First, try to find the allowed email record
      const allowedEmails = await authStorage.listAllowedEmails();
      const allowedEmail = allowedEmails.find(a => a.id === req.params.id);

      if (!allowedEmail) {
        return res.status(404).json({ message: "Person not found" });
      }

      // Find the corresponding user by email (should always exist after migration)
      const user = await authStorage.getUserByEmail(allowedEmail.email);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update the user record
      const updated = await storage.updateUser(user.id, {
        role,
        firstName,
      });

      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating person:", error);
      res.status(500).json({ message: "Failed to update person" });
    }
  });

  // Admin: set password for user
  app.post("/api/admin/users/:id/password", requireAdmin, async (req: any, res) => {
    try {
      const password = typeof req.body?.password === "string" ? req.body.password.trim() : null;

      if (!password || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      const user = await authStorage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await authStorage.updateUser(req.params.id, { passwordHash });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error setting user password:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // Admin: delete user
  app.delete("/api/admin/users/:id", requireAdmin, async (req: any, res) => {
    try {
      // Prevent admin from deleting themselves
      if (req.params.id === req.user.id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      // Prevent deletion of default admin
      const userToDelete = await authStorage.getUser(req.params.id);
      if (!userToDelete) {
        return res.status(404).json({ message: "User not found" });
      }

      const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL ?? "mark.clement@outlook.com";
      if (userToDelete.email === DEFAULT_ADMIN_EMAIL.toLowerCase()) {
        return res.status(400).json({ message: "Cannot delete the default admin account" });
      }

      const deleted = await storage.deleteUser(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Admin: list all people (allowed emails + users)
  app.get("/api/admin/people", requireAdmin, async (req: any, res) => {
    try {
      const [allowedEmails, users] = await Promise.all([
        authStorage.listAllowedEmails(),
        storage.getAllUsers(),
      ]);

      // Create a map of users by email for easy lookup
      const userMap = new Map(users.map((user) => [user.email.toLowerCase(), user]));

      // Combine allowed emails and users into a unified list
      const people = allowedEmails.map((allowed) => {
        const user = userMap.get(allowed.email.toLowerCase());
        return {
          id: allowed.id, // Always use allowed email ID for consistency
          email: allowed.email,
          firstName: user?.firstName || null,
          role: user?.role || "invited",
          createdAt: user?.createdAt || allowed.createdAt,
          invitedAt: allowed.createdAt,
          registeredAt: user?.createdAt || null,
          isRegistered: !!user,
          invitedBy: allowed.invitedBy,
        };
      });

      // Add any registered users who might not have an allowed email entry
      users.forEach((user) => {
        const exists = people.some((p) => p.email.toLowerCase() === user.email.toLowerCase());
        if (!exists) {
          people.push({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            role: user.role,
            createdAt: user.createdAt,
            invitedAt: null,
            registeredAt: user.createdAt,
            isRegistered: true,
            invitedBy: null,
          });
        }
      });

      res.json(people);
    } catch (error) {
      console.error("Error fetching people:", error);
      res.status(500).json({ message: "Failed to fetch people" });
    }
  });

  // Admin: allowed email management
  app.get("/api/admin/allowed-emails", requireAdmin, async (_req, res) => {
    try {
      const allowed = await authStorage.listAllowedEmails();
      res.json(allowed);
    } catch (error) {
      console.error("Error fetching allowed emails:", error);
      res.status(500).json({ message: "Failed to fetch allowed emails" });
    }
  });

  app.post("/api/admin/allowed-emails", requireAdmin, async (req: any, res) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : null;
      const password = typeof req.body?.password === "string" ? req.body.password : "Shady0ks";

      if (!email) {
        return res.status(400).json({ message: "Valid email is required" });
      }

      // Check if user already exists
      const existingUser = await authStorage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "User with this email already exists" });
      }

      // Ensure email is allowed
      await authStorage.ensureAllowedEmail(email, req.user.id);

      // Create user account with provided credentials
      const passwordHash = await bcrypt.hash(password, 12);
      await authStorage.createUser({
        email,
        passwordHash,
        firstName,
        role: "user",
      });

      const allowed = await authStorage.listAllowedEmails();
      res.status(201).json(allowed);
    } catch (error) {
      console.error("Error adding allowed email:", error);
      res.status(500).json({ message: "Failed to add allowed email" });
    }
  });

  app.patch("/api/admin/allowed-emails/:id", requireAdmin, async (req: any, res) => {
    try {
      const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : undefined;

      if (firstName === undefined) {
        return res.status(400).json({ message: "firstName is required" });
      }

      const updated = await authStorage.updateAllowedEmail(req.params.id, { firstName });
      if (!updated) {
        return res.status(404).json({ message: "Allowed email not found" });
      }

      const allowed = await authStorage.listAllowedEmails();
      res.json(allowed);
    } catch (error) {
      console.error("Error updating allowed email:", error);
      res.status(500).json({ message: "Failed to update allowed email" });
    }
  });

  app.delete("/api/admin/allowed-emails/:id", requireAdmin, async (req, res) => {
    try {
      await authStorage.removeAllowedEmail(req.params.id);
      const allowed = await authStorage.listAllowedEmails();
      res.json(allowed);
    } catch (error) {
      console.error("Error removing allowed email:", error);
      res.status(500).json({ message: "Failed to remove allowed email" });
    }
  });

  // Admin: list sessions with stats
  app.get("/api/admin/sessions", requireAdmin, async (_req, res) => {
    try {
      const [sessions, puzzles, users] = await Promise.all([
        storage.getAllSessions(),
        storage.getAllPuzzles(),
        storage.getAllUsers(),
      ]);

      const puzzleMap = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle]));
      const userMap = new Map(users.map((user) => [user.id, user]));

      const enriched = await Promise.all(
        sessions.map(async (session) => {
          const puzzle = puzzleMap.get(session.puzzleId);
          const progress = await storage.getProgress(session.id);
          let percentComplete = 0;
          if (puzzle?.data && (puzzle.data as any).grid) {
            const totalCells = countWhiteCells((puzzle.data as any).grid as string[]);
            const userGrid = (progress?.grid as string[][] | null) || [];
            const filled = countFilledCells(userGrid);
            percentComplete = totalCells > 0 ? Math.round((filled / totalCells) * 100) : 0;
          }

          return {
            ...session,
            puzzleTitle: puzzle?.title ?? "Unknown",
            puzzleExternalId: puzzle?.puzzleId ?? null,
            ownerName: userMap.get(session.ownerId)?.firstName || userMap.get(session.ownerId)?.email,
            percentComplete,
            submittedAt: progress?.submittedAt ?? null,
          };
        }),
      );

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching admin sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  // Get build information
  app.get("/api/build-info", async (_req, res) => {
    try {
      const buildInfoPath = path.join(__dirname, "build-info.json");
      if (fs.existsSync(buildInfoPath)) {
        const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf-8"));
        res.json(buildInfo);
      } else {
        res.json({ timestamp: "unknown", date: "unknown", time: "unknown" });
      }
    } catch (error) {
      console.error("Error fetching build info:", error);
      res.status(500).json({ message: "Failed to fetch build info" });
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
