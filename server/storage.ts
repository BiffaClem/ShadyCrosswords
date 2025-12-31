import { 
  puzzles, puzzleSessions, sessionParticipants, puzzleProgress, sessionInvites, users,
  type Puzzle, type InsertPuzzle,
  type PuzzleSession, type InsertSession,
  type SessionParticipant, type InsertParticipant,
  type PuzzleProgress, type InsertProgress,
  type SessionInvite, type InsertInvite
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, sql } from "drizzle-orm";

export interface IStorage {
  // Puzzles
  getPuzzle(id: string): Promise<Puzzle | undefined>;
  getPuzzleByPuzzleId(puzzleId: string): Promise<Puzzle | undefined>;
  getAllPuzzles(): Promise<Puzzle[]>;
  createPuzzle(puzzle: InsertPuzzle): Promise<Puzzle>;
  
  // Sessions
  getSession(id: string): Promise<PuzzleSession | undefined>;
  getAllSessions(): Promise<PuzzleSession[]>;
  getUserSessions(userId: string): Promise<PuzzleSession[]>;
  createSession(session: InsertSession): Promise<PuzzleSession>;
  deleteSession(id: string): Promise<void>;
  
  // Participants
  getSessionParticipants(sessionId: string): Promise<SessionParticipant[]>;
  getSessionParticipantsWithUsers(sessionId: string): Promise<Array<{id: string; firstName: string | null; email: string | null}>>;
  addParticipant(participant: InsertParticipant): Promise<SessionParticipant>;
  isParticipant(sessionId: string, userId: string): Promise<boolean>;
  
  // Progress
  getProgress(sessionId: string): Promise<PuzzleProgress | undefined>;
  saveProgress(progress: InsertProgress): Promise<PuzzleProgress>;
  updateProgress(sessionId: string, grid: any, updatedBy: string): Promise<PuzzleProgress | undefined>;
  submitSession(sessionId: string): Promise<PuzzleProgress | undefined>;
  
  // Participant activity
  getSessionParticipantsWithActivity(sessionId: string): Promise<Array<{id: string; firstName: string | null; email: string | null; lastActivity: Date | null; joinedAt: Date | null}>>;
  updateParticipantActivity(sessionId: string, userId: string): Promise<void>;
  
  // Invites
  createInvites(invites: InsertInvite[]): Promise<SessionInvite[]>;
  getInvitesForUser(userId: string): Promise<SessionInvite[]>;
  getInvite(id: string): Promise<SessionInvite | undefined>;
  updateInviteStatus(id: string, status: string): Promise<SessionInvite | undefined>;
  
  // Users
  getAllUsers(): Promise<Array<{id: string; firstName: string | null; email: string; role: string; createdAt: Date | null}>>;
  updateUser(id: string, data: { firstName?: string; role?: string }): Promise<{id: string; firstName: string | null; email: string; role: string} | undefined>;
  deleteUser(id: string): Promise<boolean>;
  
  // Activity
  getRecentUserActivity(): Promise<Array<{id: string; firstName: string | null; email: string | null; lastActivity: Date | null}>>;
}

export class DatabaseStorage implements IStorage {
  // Puzzles
  async getPuzzle(id: string): Promise<Puzzle | undefined> {
    const [puzzle] = await db.select().from(puzzles).where(eq(puzzles.id, id));
    return puzzle;
  }

  async getPuzzleByPuzzleId(puzzleId: string): Promise<Puzzle | undefined> {
    const [puzzle] = await db.select().from(puzzles).where(eq(puzzles.puzzleId, puzzleId));
    return puzzle;
  }

  async getAllPuzzles(): Promise<Puzzle[]> {
    return db.select().from(puzzles);
  }

  async createPuzzle(puzzle: InsertPuzzle): Promise<Puzzle> {
    const [created] = await db.insert(puzzles).values(puzzle).returning();
    return created;
  }

  // Sessions
  async getSession(id: string): Promise<PuzzleSession | undefined> {
    const [session] = await db.select().from(puzzleSessions).where(eq(puzzleSessions.id, id));
    if (session) {
      return { ...session, isCollaborative: !!session.isCollaborative };
    }
    return session;
  }

  async getAllSessions(): Promise<PuzzleSession[]> {
    const sessions = await db.select().from(puzzleSessions);
    return sessions.map(session => ({ ...session, isCollaborative: !!session.isCollaborative }));
  }

  async getUserSessions(userId: string): Promise<PuzzleSession[]> {
    // Get sessions where user is owner or participant
    const owned = await db.select().from(puzzleSessions).where(eq(puzzleSessions.ownerId, userId));
    
    const participated = await db
      .select({ session: puzzleSessions })
      .from(sessionParticipants)
      .innerJoin(puzzleSessions, eq(sessionParticipants.sessionId, puzzleSessions.id))
      .where(eq(sessionParticipants.userId, userId));
    
    const participatedSessions = participated.map(p => p.session);
    
    // Merge and dedupe
    const sessionMap = new Map<string, PuzzleSession>();
    [...owned, ...participatedSessions].forEach(s => sessionMap.set(s.id, { ...s, isCollaborative: !!s.isCollaborative }));
    return Array.from(sessionMap.values());
  }

  async createSession(session: InsertSession): Promise<PuzzleSession> {
    const [created] = await db.insert(puzzleSessions).values(session).returning();
    return { ...created, isCollaborative: !!created.isCollaborative };
  }

  async deleteSession(id: string): Promise<void> {
    // Delete in correct order due to foreign keys
    await db.delete(sessionInvites).where(eq(sessionInvites.sessionId, id));
    await db.delete(puzzleProgress).where(eq(puzzleProgress.sessionId, id));
    await db.delete(sessionParticipants).where(eq(sessionParticipants.sessionId, id));
    await db.delete(puzzleSessions).where(eq(puzzleSessions.id, id));
  }

  // Participants
  async getSessionParticipants(sessionId: string): Promise<SessionParticipant[]> {
    return db.select().from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
  }

  async getSessionParticipantsWithUsers(sessionId: string): Promise<Array<{id: string; firstName: string | null; email: string | null}>> {
    const results = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        email: users.email,
      })
      .from(sessionParticipants)
      .innerJoin(users, eq(sessionParticipants.userId, users.id))
      .where(eq(sessionParticipants.sessionId, sessionId));
    return results;
  }

  async getSessionParticipantsWithActivity(sessionId: string): Promise<Array<{id: string; firstName: string | null; email: string | null; lastActivity: Date | null; joinedAt: Date | null}>> {
    const results = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        email: users.email,
        lastActivity: sessionParticipants.lastActivity,
        joinedAt: sessionParticipants.joinedAt,
      })
      .from(sessionParticipants)
      .innerJoin(users, eq(sessionParticipants.userId, users.id))
      .where(eq(sessionParticipants.sessionId, sessionId));
    return results;
  }

  async updateParticipantActivity(sessionId: string, userId: string): Promise<void> {
    // First try to update existing row
    const result = await db
      .update(sessionParticipants)
      .set({ lastActivity: new Date() })
      .where(and(eq(sessionParticipants.sessionId, sessionId), eq(sessionParticipants.userId, userId)))
      .returning();
    
    // If no row was updated, insert one (handles legacy sessions where owner wasn't added as participant)
    if (result.length === 0) {
      await db
        .insert(sessionParticipants)
        .values({
          sessionId,
          userId,
          lastActivity: new Date(),
        })
        .onConflictDoNothing();
    }
  }

  async addParticipant(participant: InsertParticipant): Promise<SessionParticipant> {
    const [created] = await db.insert(sessionParticipants).values(participant).returning();
    return created;
  }

  async isParticipant(sessionId: string, userId: string): Promise<boolean> {
    const [participant] = await db
      .select()
      .from(sessionParticipants)
      .where(and(eq(sessionParticipants.sessionId, sessionId), eq(sessionParticipants.userId, userId)));
    return !!participant;
  }

  // Progress
  async getProgress(sessionId: string): Promise<PuzzleProgress | undefined> {
    const [progress] = await db.select().from(puzzleProgress).where(eq(puzzleProgress.sessionId, sessionId));
    return progress;
  }

  async saveProgress(progress: InsertProgress): Promise<PuzzleProgress> {
    const [created] = await db
      .insert(puzzleProgress)
      .values(progress)
      .onConflictDoUpdate({
        target: puzzleProgress.sessionId,
        set: {
          grid: progress.grid,
          updatedBy: progress.updatedBy,
          updatedAt: new Date(),
        },
      })
      .returning();
    return created;
  }

  async updateProgress(sessionId: string, grid: any, updatedBy: string): Promise<PuzzleProgress | undefined> {
    const [updated] = await db
      .update(puzzleProgress)
      .set({ grid, updatedBy, updatedAt: new Date() })
      .where(eq(puzzleProgress.sessionId, sessionId))
      .returning();
    return updated;
  }

  async submitSession(sessionId: string): Promise<PuzzleProgress | undefined> {
    const [updated] = await db
      .update(puzzleProgress)
      .set({ submittedAt: new Date() })
      .where(eq(puzzleProgress.sessionId, sessionId))
      .returning();
    return updated;
  }

  // Invites
  async createInvites(invites: InsertInvite[]): Promise<SessionInvite[]> {
    if (invites.length === 0) return [];
    const created = await db.insert(sessionInvites).values(invites).returning();
    return created;
  }

  async getInvitesForUser(userId: string): Promise<SessionInvite[]> {
    return db.select().from(sessionInvites).where(eq(sessionInvites.invitedUserId, userId));
  }

  async getInvite(id: string): Promise<SessionInvite | undefined> {
    const [invite] = await db.select().from(sessionInvites).where(eq(sessionInvites.id, id));
    return invite;
  }

  async updateInviteStatus(id: string, status: string): Promise<SessionInvite | undefined> {
    const [updated] = await db
      .update(sessionInvites)
      .set({ status, respondedAt: new Date() })
      .where(eq(sessionInvites.id, id))
      .returning();
    return updated;
  }

  // Users
  async getAllUsers(): Promise<Array<{id: string; firstName: string | null; email: string; role: string; createdAt: Date | null}>> {
    return db.select({
      id: users.id,
      firstName: users.firstName,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    }).from(users);
  }

  async updateUser(id: string, data: { firstName?: string; role?: string }): Promise<{id: string; firstName: string | null; email: string; role: string} | undefined> {
    const updatePayload: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.firstName !== undefined) {
      updatePayload.firstName = data.firstName;
    }

    if (data.role !== undefined) {
      updatePayload.role = data.role;
    }

    const [updated] = await db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, id))
      .returning({ id: users.id, firstName: users.firstName, email: users.email, role: users.role });
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    // Delete in correct order due to foreign keys
    // First delete session invites (both invited by and invited user)
    await db.delete(sessionInvites).where(eq(sessionInvites.invitedById, id));
    await db.delete(sessionInvites).where(eq(sessionInvites.invitedUserId, id));
    
    // Delete session participants
    await db.delete(sessionParticipants).where(eq(sessionParticipants.userId, id));
    
    // Delete puzzle progress updates
    await db.delete(puzzleProgress).where(eq(puzzleProgress.updatedBy, id));
    
    // Update puzzles uploaded by this user to null (or we could delete them, but keeping them seems better)
    await db.update(puzzles).set({ uploadedBy: null }).where(eq(puzzles.uploadedBy, id));
    
    // For sessions owned by this user, we need to decide what to do
    // Option 1: Delete the sessions (cascades to progress, participants, invites)
    // Option 2: Transfer ownership to another admin
    // For now, let's delete the sessions as they're tied to the user
    const ownedSessions = await db.select({ id: puzzleSessions.id }).from(puzzleSessions).where(eq(puzzleSessions.ownerId, id));
    for (const session of ownedSessions) {
      await this.deleteSession(session.id);
    }
    
    // Finally delete the user
    const result = await db.delete(users).where(eq(users.id, id));
    return result.changes > 0;
  }

  // Activity
  async getRecentUserActivity(): Promise<Array<{id: string; firstName: string | null; email: string | null; lastActivity: Date | null}>> {
    // Get the most recent activity for each user across all sessions
    const results = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        email: users.email,
        lastActivity: sql<Date>`MAX(${sessionParticipants.lastActivity})`.as('lastActivity'),
      })
      .from(users)
      .leftJoin(sessionParticipants, eq(sessionParticipants.userId, users.id))
      .groupBy(users.id, users.firstName, users.email)
      .orderBy(sql`MAX(${sessionParticipants.lastActivity}) DESC NULLS LAST`);
    return results;
  }
}

export const storage = new DatabaseStorage();
