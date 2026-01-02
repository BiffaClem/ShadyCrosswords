import { describe, it, expect } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

import Crossword from "@/components/Crossword";
import { PuzzleData } from "@/lib/crossword-types";
import { useState, useCallback } from "react";

const tinyPuzzle: PuzzleData = {
  puzzleId: "test",
  title: "Test Puzzle",
  source: { site: "", url: "" },
  size: { rows: 2, cols: 2 },
  grid: ["..", ".."],
  numbers: [
    [1, 2],
    [3, 4],
  ],
  clues: {
    across: [
      {
        number: 1,
        direction: "across",
        text: "Across 1",
        enumeration: "2",
        answer: "AT",
        explanation: "",
        row: 1,
        col: 1,
        length: 2,
        wordBoundaries: [],
        start: { row: 0, col: 0 },
        end: { row: 0, col: 1 },
      },
      {
        number: 3,
        direction: "across",
        text: "Across 3",
        enumeration: "2",
        answer: "BY",
        explanation: "",
        row: 2,
        col: 1,
        length: 2,
        wordBoundaries: [],
        start: { row: 1, col: 0 },
        end: { row: 1, col: 1 },
      },
    ],
    down: [
      {
        number: 1,
        direction: "down",
        text: "Down 1",
        enumeration: "2",
        answer: "AB",
        explanation: "",
        row: 1,
        col: 1,
        length: 2,
        wordBoundaries: [],
        start: { row: 0, col: 0 },
        end: { row: 1, col: 0 },
      },
      {
        number: 2,
        direction: "down",
        text: "Down 2",
        enumeration: "2",
        answer: "TY",
        explanation: "",
        row: 1,
        col: 2,
        length: 2,
        wordBoundaries: [],
        start: { row: 0, col: 1 },
        end: { row: 1, col: 1 },
      },
    ],
  },
};

describe("Crossword keyboard", () => {
  it("does not crash on key press", async () => {
    render(<Crossword initialPuzzle={tinyPuzzle} />);

    await waitFor(() => {
      // Allow effects to select the first cell
      return true;
    });

    expect(() => {
      fireEvent.keyDown(window, { key: "T", code: "KeyT" });
    }).not.toThrow();
  });

  it("does not loop when parent syncs grid", async () => {
    const Wrapper = () => {
      const [grid, setGrid] = useState<string[][] | undefined>(undefined);
      const handleChange = useCallback((row: number, col: number, value: string, newGrid: string[][]) => {
        setGrid(newGrid);
      }, []);
      return <Crossword initialPuzzle={tinyPuzzle} initialGrid={grid} onCellChange={handleChange} />;
    };

    render(<Wrapper />);

    await waitFor(() => true);

    expect(() => {
      fireEvent.keyDown(window, { key: "T", code: "KeyT" });
    }).not.toThrow();
  });
});
