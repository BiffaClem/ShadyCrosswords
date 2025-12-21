import { 
  puzzles, puzzleSessions, sessionParticipants, puzzleProgress,
  type Puzzle, type InsertPuzzle,
  type PuzzleSession, type InsertSession,
  type SessionParticipant, type InsertParticipant,
  type PuzzleProgress, type InsertProgress
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Puzzles
  getPuzzle(id: string): Promise<Puzzle | undefined>;
  getPuzzleByPuzzleId(puzzleId: string): Promise<Puzzle | undefined>;
  getAllPuzzles(): Promise<Puzzle[]>;
  createPuzzle(puzzle: InsertPuzzle): Promise<Puzzle>;
  
  // Sessions
  getSession(id: string): Promise<PuzzleSession | undefined>;
  getUserSessions(userId: string): Promise<PuzzleSession[]>;
  createSession(session: InsertSession): Promise<PuzzleSession>;
  
  // Participants
  getSessionParticipants(sessionId: string): Promise<SessionParticipant[]>;
  addParticipant(participant: InsertParticipant): Promise<SessionParticipant>;
  isParticipant(sessionId: string, userId: string): Promise<boolean>;
  
  // Progress
  getProgress(sessionId: string): Promise<PuzzleProgress | undefined>;
  saveProgress(progress: InsertProgress): Promise<PuzzleProgress>;
  updateProgress(sessionId: string, grid: any, updatedBy: string): Promise<PuzzleProgress | undefined>;
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
    return session;
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
    [...owned, ...participatedSessions].forEach(s => sessionMap.set(s.id, s));
    return Array.from(sessionMap.values());
  }

  async createSession(session: InsertSession): Promise<PuzzleSession> {
    const [created] = await db.insert(puzzleSessions).values(session).returning();
    return created;
  }

  // Participants
  async getSessionParticipants(sessionId: string): Promise<SessionParticipant[]> {
    return db.select().from(sessionParticipants).where(eq(sessionParticipants.sessionId, sessionId));
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
}

export const storage = new DatabaseStorage();
