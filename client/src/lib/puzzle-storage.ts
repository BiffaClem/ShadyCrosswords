import { PuzzleData } from "./crossword-types";

interface StoredPuzzle {
  id: string;
  data: PuzzleData;
  loadedAt: number;
}

interface PuzzleProgress {
  puzzleId: string;
  grid: string[][];
  updatedAt: number;
}

const PUZZLES_KEY = "crossword_puzzles";
const PROGRESS_KEY = "crossword_progress";

export const puzzleStorage = {
  // Puzzle library operations
  savePuzzle: (puzzle: PuzzleData) => {
    const puzzles = puzzleStorage.getPuzzles();
    const exists = puzzles.find(p => p.id === puzzle.puzzleId);
    
    if (exists) {
      Object.assign(exists, { data: puzzle, loadedAt: Date.now() });
    } else {
      puzzles.push({
        id: puzzle.puzzleId,
        data: puzzle,
        loadedAt: Date.now(),
      });
    }
    
    localStorage.setItem(PUZZLES_KEY, JSON.stringify(puzzles));
  },

  getPuzzles: (): StoredPuzzle[] => {
    try {
      const data = localStorage.getItem(PUZZLES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  getPuzzleById: (id: string): PuzzleData | null => {
    const puzzles = puzzleStorage.getPuzzles();
    return puzzles.find(p => p.id === id)?.data || null;
  },

  deletePuzzle: (id: string) => {
    const puzzles = puzzleStorage.getPuzzles();
    const filtered = puzzles.filter(p => p.id !== id);
    localStorage.setItem(PUZZLES_KEY, JSON.stringify(filtered));
    
    // Also delete progress
    puzzleStorage.deleteProgress(id);
  },

  // Progress operations
  saveProgress: (puzzleId: string, grid: string[][]) => {
    const progress = puzzleStorage.getAllProgress();
    const exists = progress.find(p => p.puzzleId === puzzleId);
    
    if (exists) {
      exists.grid = grid;
      exists.updatedAt = Date.now();
    } else {
      progress.push({ puzzleId, grid, updatedAt: Date.now() });
    }
    
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  },

  getProgress: (puzzleId: string): string[][] | null => {
    const progress = puzzleStorage.getAllProgress();
    return progress.find(p => p.puzzleId === puzzleId)?.grid || null;
  },

  getAllProgress: (): PuzzleProgress[] => {
    try {
      const data = localStorage.getItem(PROGRESS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  deleteProgress: (puzzleId: string) => {
    const progress = puzzleStorage.getAllProgress();
    const filtered = progress.filter(p => p.puzzleId !== puzzleId);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(filtered));
  },
};
