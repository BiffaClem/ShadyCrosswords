export interface Position {
  row: number;
  col: number;
}

export interface Clue {
  number: number;
  direction: "across" | "down";
  text: string;
  enumeration: string;
  answer: string;
  explanation: string;
  row: number; // 1-based in JSON, convert to 0-based for internal use
  col: number; // 1-based in JSON
  length: number;
  wordBoundaries: number[];
  start: Position;
  end: Position;
  sanity?: {
    crossingConflicts?: any[];
  };
}

export interface PuzzleData {
  puzzleId: string;
  title: string;
  source: {
    site: string;
    url: string;
  };
  size: {
    rows: number;
    cols: number;
  };
  grid: string[]; // Array of strings, e.g. "....#"
  numbers: (number | null)[][];
  clues: {
    across: Clue[];
    down: Clue[];
  };
  sanityChecks?: any;
}

export interface CellData {
  row: number;
  col: number;
  isBlack: boolean;
  value: string; // The user entered letter
  number: number | null;
  clueIds: string[]; // e.g. "across-1", "down-5"
}

export type GridState = string[][]; // 2D array of user inputs
