import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  puzzleProgress,
  puzzleSessions,
  puzzles,
  users,
} from "@shared/schema";

async function run() {
  await db.delete(puzzleProgress);
  await db.delete(puzzleSessions);
  await db.delete(puzzles);
  await db.delete(users);

  const [user] = await db
    .insert(users)
    .values({
      email: "test@example.com",
      firstName: "Test",
      role: "user",
      passwordHash: "hash",
    })
    .returning();

  const samplePuzzle = {
    puzzleId: "TEST",
    title: "Test Puzzle",
    date: "2024-01-01",
    size: { rows: 2, cols: 2 },
    grid: ["..", ".."],
    numbers: [
      [1, null],
      [null, 2],
    ],
    clues: {
      across: [
        {
          number: 1,
          row: 1,
          col: 1,
          length: 2,
          direction: "across",
          text: "Sample",
          answer: "AB",
          enumeration: "2",
        },
      ],
      down: [
        {
          number: 2,
          row: 1,
          col: 2,
          length: 2,
          direction: "down",
          text: "Sample",
          answer: "BC",
          enumeration: "2",
        },
      ],
    },
  };

  const [puzzle] = await db
    .insert(puzzles)
    .values({
      puzzleId: samplePuzzle.puzzleId,
      title: samplePuzzle.title,
      data: samplePuzzle,
      uploadedBy: user.id,
    })
    .returning();

  const [session] = await db
    .insert(puzzleSessions)
    .values({
      puzzleId: puzzle.id,
      ownerId: user.id,
      name: "Sample Session",
      isCollaborative: false,
      difficulty: "standard",
    })
    .returning();

  const inserted = await db
    .insert(puzzleProgress)
    .values({
      sessionId: session.id,
      grid: [
        ["A", ""],
        ["", "B"],
      ],
      updatedBy: user.id,
    })
    .returning();
  console.log("Inserted", inserted);

  const rows = await db.select().from(puzzleProgress);
  console.log("Selected", JSON.stringify(rows, null, 2));

  const progress = await storage.getProgress(session.id);
  console.log("Storage.getProgress", JSON.stringify(progress, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
