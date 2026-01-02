import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PuzzleData, Clue, Position } from "@/lib/crossword-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Eye, RotateCcw, Menu, X, ZoomIn, ZoomOut, Send, HelpCircle, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { puzzleStorage } from "@/lib/puzzle-storage";

interface RecentSession {
  id: string;
  name: string;
  puzzleTitle: string;
}

interface CrosswordProps {
  initialPuzzle?: PuzzleData;
  initialGrid?: string[][];
  onCellChange?: (row: number, col: number, value: string, grid: string[][]) => void;
  onGridChange?: (grid: string[][]) => void;
  onSubmit?: () => void;
  isSubmitted?: boolean;
  isCollaborative?: boolean;
  recentSessions?: RecentSession[];
  onSessionSelect?: (sessionId: string) => void;
  sessionId?: string; // For beacon saves on unload
  shouldAutoSave?: boolean;
}

const getClueId = (clue: Clue) => `${clue.direction}-${clue.number}`;

const isEditableTarget = (target: EventTarget | null) => {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
};

export default function Crossword({ initialPuzzle, initialGrid, onCellChange, onGridChange, onSubmit, isSubmitted, isCollaborative, recentSessions, onSessionSelect, sessionId, shouldAutoSave }: CrosswordProps) {
  const puzzle = initialPuzzle || null;
  const [gridState, setGridState] = useState<string[][]>(initialGrid || []);
  const [activeCell, setActiveCell] = useState<Position | null>(null);
  const [direction, setDirection] = useState<"across" | "down">("across");
  const [showErrors, setShowErrors] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Detect mobile on initial render only
  const isMobileInitial = typeof window !== 'undefined' && 'ontouchstart' in window;
  const [isMobile, setIsMobile] = useState(isMobileInitial);
  const [zoom, setZoom] = useState(isMobileInitial ? 0.5 : 1);
  const [hasInitializedZoom, setHasInitializedZoom] = useState(false);
  const [cluePanelHeight, setCluePanelHeight] = useState(200);
  const [clueInputMode, setClueInputMode] = useState(false);
  const [activeInputClue, setActiveInputClue] = useState<Clue | null>(null);
  const [clueInputValue, setClueInputValue] = useState("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const clueAnswerInputRef = useRef<HTMLInputElement>(null);
  const activeClueRef = useRef<HTMLButtonElement>(null);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const grid = gridState;
  const autosaveEnabled = shouldAutoSave !== false && !!sessionId;
  const sessionIdRef = useRef<string | undefined>(sessionId);
  const latestGridRef = useRef<string[][] | null>(initialGrid ?? null);
  const lastSavedGridRef = useRef<string | null>(initialGrid ? JSON.stringify(initialGrid) : null);
  const pendingSaveRef = useRef<string[][] | null>(null);
  const hasHydratedInitialGridRef = useRef(false);
  
  // Refs for long-press keyboard detection
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggered = useRef(false);
  
  // Refs for separator dragging
  const isDraggingSeparator = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(200);

  const updateGrid = useCallback((nextGrid: string[][], change?: { row: number; col: number; value: string }) => {
    setGridState(nextGrid);

    // For single-cell edits, notify the cell callback only (avoids double updates).
    if (change && onCellChange) {
      onCellChange(change.row, change.col, change.value, nextGrid);
      return;
    }

    // For bulk updates (reveal/check/reset), notify the grid callback.
    if (!change && onGridChange) {
      onGridChange(nextGrid);
    }
  }, [onCellChange, onGridChange]);

  // Auto-focus hidden input when entering clue input mode
  useEffect(() => {
    if (clueInputMode && hiddenInputRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 100);
    }
  }, [clueInputMode]);
  
  // Detect mobile for layout purposes, but only set zoom once
  useEffect(() => {
    const checkMobile = () => {
      const mobile = 'ontouchstart' in window;
      setIsMobile(mobile);
    };
    
    // Set initial zoom only once
    if (!hasInitializedZoom) {
      const mobile = 'ontouchstart' in window;
      setZoom(mobile ? 0.5 : 1);
      setHasInitializedZoom(true);
    }
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [hasInitializedZoom]);

  // Update grid when initialGrid prop changes (for real-time collaboration)
  useEffect(() => {
    if (!initialGrid || initialGrid.length === 0) {
      return;
    }

    // Deep compare grids to avoid unnecessary resets
    const gridsEqual = latestGridRef.current && 
      latestGridRef.current.length === initialGrid.length &&
      latestGridRef.current.every((row, r) => 
        row.length === initialGrid[r].length && 
        row.every((cell, c) => cell === initialGrid[r][c])
      );

    const needsSync = !gridsEqual;
    const hasHydrated = hasHydratedInitialGridRef.current;

    if (needsSync) {
      setGridState(initialGrid);
      latestGridRef.current = initialGrid;
    }

    if (!hasHydrated || needsSync) {
      lastSavedGridRef.current = JSON.stringify(initialGrid);
      hasHydratedInitialGridRef.current = true;
    }
  }, [initialGrid]);

  // Initialize grid state when puzzle loads
  useEffect(() => {
    if (sessionId) {
      return;
    }

    if (puzzle && gridState.length === 0) {
      const rows = puzzle.size.rows;
      const cols = puzzle.size.cols;
      
      // Try to load saved progress from localStorage (fallback for non-session mode)
      if (!initialGrid) {
        const savedProgress = puzzleStorage.getProgress(puzzle.puzzleId);
        if (savedProgress) {
          setGridState(savedProgress);
          lastSavedGridRef.current = JSON.stringify(savedProgress);
          latestGridRef.current = savedProgress;
        } else {
          const newGrid = Array(rows).fill(null).map(() => Array(cols).fill(""));
          setGridState(newGrid);
          lastSavedGridRef.current = JSON.stringify(newGrid);
          latestGridRef.current = newGrid;
        }
        hasHydratedInitialGridRef.current = true;
      }
      
      // Find first white square to select
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (puzzle.grid[r][c] === ".") {
            setActiveCell({ row: r, col: c });
            return;
          }
        }
      }
    }
  }, [puzzle, initialGrid, sessionId]);

  // Stable save function that doesn't change between renders
  const doSave = useCallback(async (grid: string[][], useKeepalive = false) => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;
    
    const gridJson = JSON.stringify(grid);
    // Skip if already saved this exact grid
    if (gridJson === lastSavedGridRef.current) return;
    
    try {
      await fetch(`/api/sessions/${currentSessionId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grid }),
        credentials: 'include',
        keepalive: useKeepalive
      });
      lastSavedGridRef.current = gridJson;
      // Clear pending only if this matches what we just saved
      if (pendingSaveRef.current && JSON.stringify(pendingSaveRef.current) === gridJson) {
        pendingSaveRef.current = null;
      }
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  }, []); // No dependencies - uses refs

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    latestGridRef.current = gridState;
  }, [gridState]);
  
  // Save progress whenever grid changes (with debounce)
  useEffect(() => {
    if (!puzzle || !grid.length || !sessionId || !hasHydratedInitialGridRef.current || !autosaveEnabled) return;
    
    // Always save to localStorage as backup
    puzzleStorage.saveProgress(puzzle.puzzleId, grid);
    
    // Check if grid actually changed from last save
    const gridJson = JSON.stringify(grid);
    if (gridJson === lastSavedGridRef.current) return;
    
    // Track pending changes
    pendingSaveRef.current = grid;
    
    // Debounce server saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (pendingSaveRef.current) {
        doSave(pendingSaveRef.current);
      }
    }, 1000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [grid, puzzle, sessionId, doSave, autosaveEnabled]);

  // Flush pending saves on unmount
  useEffect(() => {
    if (!autosaveEnabled) return;
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (pendingSaveRef.current) {
        doSave(pendingSaveRef.current, true);
      }
    };
  }, [doSave, autosaveEnabled]);

  // Save on page unload and visibility change
  useEffect(() => {
    if (!autosaveEnabled) return;
    const handleBeforeUnload = () => {
      if (pendingSaveRef.current) {
        doSave(pendingSaveRef.current, true);
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingSaveRef.current) {
        doSave(pendingSaveRef.current, true);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [doSave, autosaveEnabled]);

  // Pre-calculate word boundaries
  const boundaryMap = useMemo(() => {
    if (!puzzle) return {};
    const map: Record<string, { right?: boolean; bottom?: boolean }> = {};
    
    const processClues = (clues: Clue[], dir: "across" | "down") => {
        clues.forEach(clue => {
            if (!clue.wordBoundaries) return;
            clue.wordBoundaries.forEach(b => {
                if (b >= clue.length) return;
                
                let r = clue.row - 1;
                let c = clue.col - 1;
                
                if (dir === "across") {
                    c += (b - 1);
                    const key = `${r}-${c}`;
                    if (!map[key]) map[key] = {};
                    map[key].right = true;
                } else {
                    r += (b - 1);
                    const key = `${r}-${c}`;
                    if (!map[key]) map[key] = {};
                    map[key].bottom = true;
                }
            });
        });
    };
    
    processClues(puzzle.clues.across, "across");
    processClues(puzzle.clues.down, "down");
    return map;
  }, [puzzle]);

  // Compute the complete answer grid from clues
  const answerGrid = useMemo(() => {
    if (!puzzle) return [];
    const grid: string[][] = Array(puzzle.size.rows).fill(null).map(() => 
      Array(puzzle.size.cols).fill("")
    );
    
    const fillClue = (clue: Clue) => {
      if (!clue.answer) return;
      const answer = clue.answer.toUpperCase();
      let r = clue.row - 1;
      let c = clue.col - 1;
      
      for (let i = 0; i < answer.length && i < clue.length; i++) {
        const char = answer[i];
        if (char.match(/[A-Z]/)) {
          grid[r][c] = char;
        }
        if (clue.direction === "across") c++;
        else r++;
      }
    };
    
    puzzle.clues.across.forEach(fillClue);
    puzzle.clues.down.forEach(fillClue);
    return grid;
  }, [puzzle]);

  // Get cell status for submitted crossword
  const getCellSubmittedStatus = (r: number, c: number): { isMissing: boolean; isIncorrect: boolean } => {
    if (!isSubmitted || !puzzle || puzzle.grid[r][c] === "#") {
      return { isMissing: false, isIncorrect: false };
    }
    
    const userValue = (grid[r]?.[c] || "").toUpperCase();
    const correctValue = (answerGrid[r]?.[c] || "").toUpperCase();
    
    if (!userValue && correctValue) {
      return { isMissing: true, isIncorrect: false };
    }
    if (userValue && correctValue && userValue !== correctValue) {
      return { isMissing: false, isIncorrect: true };
    }
    return { isMissing: false, isIncorrect: false };
  };

  // Get display value for submitted crossword (fills in missing answers)
  const getDisplayValue = (r: number, c: number): string => {
    if (!puzzle || puzzle.grid[r][c] === "#") return "";
    
    const userValue = grid[r]?.[c] || "";
    if (isSubmitted && !userValue) {
      return answerGrid[r]?.[c] || "";
    }
    return userValue;
  };

  const moveSelectionByArrow = useCallback((dRow: number, dCol: number) => {
    if (!puzzle || !activeCell) return;
    
    let { row, col } = activeCell;
    const { rows, cols } = puzzle.size;
    
    let nextR = row + dRow;
    let nextC = col + dCol;
    
    while (nextR >= 0 && nextR < rows && nextC >= 0 && nextC < cols) {
        if (puzzle.grid[nextR][nextC] === ".") {
            setActiveCell({ row: nextR, col: nextC });
            return;
        }
        nextR += dRow;
        nextC += dCol;
    }
  }, [puzzle, activeCell]);

  const moveCursorTyping = useCallback((step: number) => {
    if (!puzzle || !activeCell) return;
    
    let { row, col } = activeCell;
    const { rows, cols } = puzzle.size;
    
    let nextRow = row;
    let nextCol = col;
    
    let found = false;
    let attempts = 0;
    while (!found && attempts < Math.max(rows, cols)) {
      if (direction === "across") {
        nextCol += step;
      } else {
        nextRow += step;
      }
      
      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
        break;
      }
      
      if (puzzle.grid[nextRow][nextCol] === ".") {
        found = true;
      }
      attempts++;
    }

    if (found) {
      setActiveCell({ row: nextRow, col: nextCol });
    }
  }, [puzzle, activeCell, direction]);

  const toggleDirection = useCallback(() => {
    setDirection(prev => prev === "across" ? "down" : "across");
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
    if (isEditableTarget(e.target)) return;
    if (!puzzle || !activeCell) return;

    const { row, col } = activeCell;

    // Bail out if grid state is not yet hydrated to avoid runtime crashes that blank the UI
    if (!grid.length || !grid[row] || col >= grid[row].length) return;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      const newGrid = grid.map(r => [...r]);
      newGrid[row][col] = "";
      updateGrid(newGrid, { row, col, value: "" });
      moveCursorTyping(-1);
      return;
    }

    if (e.key === " ") {
      toggleDirection();
      return;
    }

    if (e.key === "Tab") {
        e.preventDefault();
        toggleDirection(); 
        return;
    }

    if (e.key.length === 1 && e.key.match(/[a-zA-Z]/)) {
      const value = e.key.toUpperCase();
      if (grid[row][col] === value) {
        moveCursorTyping(1);
        return;
      }
      const newGrid = grid.map(r => [...r]);
      newGrid[row][col] = value;
      updateGrid(newGrid, { row, col, value });
      moveCursorTyping(1);
      return;
    }

    if (e.key === "ArrowUp") moveSelectionByArrow(-1, 0);
    if (e.key === "ArrowDown") moveSelectionByArrow(1, 0);
    if (e.key === "ArrowLeft") moveSelectionByArrow(0, -1);
    if (e.key === "ArrowRight") moveSelectionByArrow(0, 1);

    if (e.key === "Enter" && clueInputMode) {
      setClueInputMode(false);
      setActiveInputClue(null);
      longPressTriggered.current = false;
      return;
    }

    if (e.key === "Escape" && clueInputMode) {
      setClueInputMode(false);
      setActiveInputClue(null);
      longPressTriggered.current = false;
      return;
    }

  }, [puzzle, activeCell, grid, direction, moveCursorTyping, moveSelectionByArrow, toggleDirection, updateGrid, clueInputMode]);

  useEffect(() => {
    if (isMobile) return;
    if (!activeCell || clueInputMode) return;
    if (isEditableTarget(document.activeElement)) return;
    gridWrapperRef.current?.focus();
  }, [activeCell, clueInputMode, isMobile]);

  const getActiveClue = (): Clue | null => {
    if (!puzzle || !activeCell) return null;
    
    const clues = puzzle.clues[direction];
    const r = activeCell.row + 1;
    const c = activeCell.col + 1;
    
    return clues.find(clue => {
      if (direction === "across") {
        return clue.row === r && c >= clue.col && c < clue.col + clue.length;
      } else {
        return clue.col === c && r >= clue.row && r < clue.row + clue.length;
      }
    }) || null;
  };
  
  const activeClue = getActiveClue();

  const getClueCells = useCallback((clue: Clue): Array<{ row: number; col: number }> => {
    if (!puzzle) return [];
    const cells: Array<{ row: number; col: number }> = [];
    let r = clue.row - 1;
    let c = clue.col - 1;
    for (let i = 0; i < clue.length; i++) {
      cells.push({ row: r, col: c });
      if (clue.direction === "across") c++;
      else r++;
    }
    return cells;
  }, [puzzle]);

  const readClueFromGrid = useCallback((clue: Clue): string => {
    const cells = getClueCells(clue);
    return cells.map(({ row, col }) => grid?.[row]?.[col] || "").join("");
  }, [getClueCells, grid]);

  const writeClueToGrid = useCallback((clue: Clue, answer: string) => {
    const cells = getClueCells(clue);
    if (!cells.length) return;
    const letters = answer.toUpperCase().replace(/[^A-Z]/g, "");
    const next = grid.map(r => [...r]);
    cells.forEach((cell, idx) => {
      next[cell.row][cell.col] = letters[idx] ?? "";
    });
    updateGrid(next);
    const nextIndex = Math.min(letters.length, cells.length - 1);
    setActiveCell(cells[nextIndex]);
  }, [getClueCells, grid, updateGrid]);
  
  useEffect(() => {
      if (!activeClue && puzzle && activeCell) {
          const otherDir = direction === "across" ? "down" : "across";
          const clues = puzzle.clues[otherDir];
          const r = activeCell.row + 1;
          const c = activeCell.col + 1;
          const hasClue = clues.some(clue => {
             if (otherDir === "across") {
                return clue.row === r && c >= clue.col && c < clue.col + clue.length;
             } else {
                return clue.col === c && r >= clue.row && r < clue.row + clue.length;
             }
          });
          
          if (hasClue) {
              setDirection(otherDir);
          }
      }
  }, [activeCell, activeClue, direction, puzzle]);

  // Auto-scroll to active clue when it changes
  useEffect(() => {
    if (activeClue && activeClueRef.current) {
      activeClueRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }, [activeClue?.number, activeClue?.direction]);

  useEffect(() => {
    if (clueInputMode && activeInputClue) {
      setClueInputValue(readClueFromGrid(activeInputClue));
      setTimeout(() => clueAnswerInputRef.current?.focus(), 50);
    }
  }, [clueInputMode, activeInputClue, readClueFromGrid]);

  const handleCellClick = (r: number, c: number) => {
    if (!puzzle) return;
    if (puzzle.grid[r][c] === "#") return;

    if (activeCell?.row === r && activeCell?.col === c) {
      toggleDirection();
    } else {
      setActiveCell({ row: r, col: c });
    }
    if (!isMobile) {
      gridWrapperRef.current?.focus();
    }
    
    // On desktop, keyboard works automatically via physical keyboard
    // On mobile, keyboard requires long-press on clues
  };
  
  // Long-press handlers for mobile clue keyboard invocation
  const handleCluePointerDown = useCallback((clue: Clue, e: React.PointerEvent) => {
    if (!isMobile || isSubmitted || !clue || !clue.answer) return;
    
    longPressStartPos.current = { x: e.clientX, y: e.clientY };
    
    longPressTimerRef.current = setTimeout(() => {
      // Long press detected - enter focused input mode for this clue
      longPressTriggered.current = true;
      setClueInputMode(true);
      setActiveInputClue(clue);
      setClueInputValue(readClueFromGrid(clue));
      setActiveCell({ row: clue.row - 1, col: clue.col - 1 });
      setDirection(clue.direction);
      setTimeout(() => clueAnswerInputRef.current?.focus(), 50);
      longPressTimerRef.current = null;
    }, 800);
  }, [isMobile, isSubmitted, readClueFromGrid]);
  
  const handleCluePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPos.current = null;
  }, []);
  
  const handleCluePointerMove = useCallback((e: React.PointerEvent) => {
    if (!longPressStartPos.current || !longPressTimerRef.current) return;
    
    const dx = Math.abs(e.clientX - longPressStartPos.current.x);
    const dy = Math.abs(e.clientY - longPressStartPos.current.y);
    
    // Cancel long-press if pointer moves too much (probably scrolling)
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      longPressStartPos.current = null;
    }
  }, []);
  
  // Separator drag handlers - use window-level events for reliable tracking
  const handleSeparatorStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isMobile) return;
    e.preventDefault();
    isDraggingSeparator.current = true;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    dragStartHeight.current = cluePanelHeight;
  }, [isMobile, cluePanelHeight]);
  
  // Window-level drag handlers
  useEffect(() => {
    const handleMove = (e: TouchEvent | MouseEvent) => {
      if (!isDraggingSeparator.current) return;
      
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const delta = dragStartY.current - clientY;
      const maxHeight = window.innerHeight - 200;
      const newHeight = Math.max(100, Math.min(maxHeight, dragStartHeight.current + delta));
      setCluePanelHeight(newHeight);
    };
    
    const handleEnd = () => {
      isDraggingSeparator.current = false;
    };
    
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, []);
  
  // Handle mobile keyboard input via hidden input
  const handleHiddenInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (clueInputMode) return;
    if (!puzzle || !activeCell) return;
    const { row, col } = activeCell;
    if (!grid.length || !grid[row] || col >= grid[row].length) return;
    
    const value = e.target.value.toUpperCase();
    if (value.length > 0 && value.match(/[A-Z]/)) {
      const char = value[value.length - 1]; // Get last character typed
      if (grid[row][col] !== char) {
        const newGrid = grid.map(r => [...r]);
        newGrid[row][col] = char;
        updateGrid(newGrid, { row, col, value: char });
      }
      moveCursorTyping(1);
    }
    
    // Clear the input for next character
    e.target.value = '';
  }, [puzzle, activeCell, grid, moveCursorTyping, clueInputMode, updateGrid]);
  
  // Handle backspace on mobile
  const handleHiddenKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (clueInputMode) return;
    if (!puzzle || !activeCell) return;
    const { row, col } = activeCell;
    if (!grid.length || !grid[row] || col >= grid[row].length) return;
    
    if (e.key === 'Backspace') {
      if (!grid[row][col]) return;
      const newGrid = grid.map(r => [...r]);
      newGrid[row][col] = '';
      updateGrid(newGrid, { row, col, value: "" });
      moveCursorTyping(-1);
    }
  }, [puzzle, activeCell, grid, moveCursorTyping, clueInputMode, updateGrid]);

  const handleClueClick = (clue: Clue) => {
    setActiveCell({ row: clue.row - 1, col: clue.col - 1 });
    setDirection(clue.direction);
    // Keyboard is invoked via long-press on clues (mobile)
  };

  const checkPuzzle = () => {
    if (!puzzle) return;
    setShowErrors(true);
    setTimeout(() => setShowErrors(false), 2000); 
  };

  const revealPuzzle = () => {
     if (!puzzle) return;
     if (!confirm("Are you sure you want to reveal the whole puzzle?")) return;
     
     const newGrid = [...grid];
     puzzle.clues.across.forEach(clue => fillClue(newGrid, clue));
     puzzle.clues.down.forEach(clue => fillClue(newGrid, clue));
     updateGrid(newGrid);
  };
  
  const fillClue = (grid: string[][], clue: Clue) => {
      let r = clue.row - 1;
      let c = clue.col - 1;
      for (let i = 0; i < clue.length; i++) {
          if (clue.direction === "across") grid[r][c + i] = clue.answer[i];
          else grid[r + i][c] = clue.answer[i];
      }
  };
  
  const revealClue = () => {
    if (!activeClue || !puzzle) return;
    const newGrid = [...grid];
    fillClue(newGrid, activeClue);
    updateGrid(newGrid);
  };
  
  const checkClue = () => {
      setShowErrors(true);
      setTimeout(() => setShowErrors(false), 1500); 
  };

  
  const isCellInActiveClue = (r: number, c: number) => {
      if (!activeClue) return false;
      const r1 = r + 1;
      const c1 = c + 1;
      if (activeClue.direction === "across") {
          return activeClue.row === r1 && c1 >= activeClue.col && c1 < activeClue.col + activeClue.length;
      } else {
          return activeClue.col === c1 && r1 >= activeClue.row && r1 < activeClue.row + activeClue.length;
      }
  };
  
  const isCellInActiveInputClue = (r: number, c: number) => {
      if (!activeInputClue) return false;
      const r1 = r + 1;
      const c1 = c + 1;
      if (activeInputClue.direction === "across") {
          return activeInputClue.row === r1 && c1 >= activeInputClue.col && c1 < activeInputClue.col + activeInputClue.length;
      } else {
          return activeInputClue.col === c1 && r1 >= activeInputClue.row && r1 < activeInputClue.row + activeInputClue.length;
      }
  };
  
  const isCellError = (r: number, c: number) => {
      if (!puzzle || !showErrors) return false;
      if (!grid[r] || grid[r][c] === undefined) return false;
      
      const userVal = grid[r][c];
      if (!userVal) return false;
      
      const r1 = r + 1;
      const c1 = c + 1;
      
      const acrossClue = puzzle.clues.across.find(cl => cl.row === r1 && c1 >= cl.col && c1 < cl.col + cl.length);
      if (acrossClue) {
          const index = c1 - acrossClue.col;
          if (acrossClue.answer[index] !== userVal) return true;
      }
      
      const downClue = puzzle.clues.down.find(cl => cl.col === c1 && r1 >= cl.row && r1 < cl.row + cl.length);
      if (downClue) {
          const index = r1 - downClue.row;
          if (downClue.answer[index] !== userVal) return true;
      }
      
      return false;
  };

  const isClueFilled = (clue: Clue) => {
     if (!grid.length) return false;
     let r = clue.row - 1;
     let c = clue.col - 1;
     
     if (r < 0 || r >= grid.length) return false;

     for (let i = 0; i < clue.length; i++) {
        let currR = r;
        let currC = c;
        if (clue.direction === "across") currC += i;
        else currR += i;
        
        if (currR >= grid.length || !grid[currR] || currC >= grid[currR].length) return false;
        
        const val = grid[currR][currC];
        if (!val) return false;
     }
     return true;
  };

  if (!puzzle) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-serif font-bold">No Puzzle Loaded</h1>
          <p className="text-muted-foreground">Please select a puzzle from the dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={gridWrapperRef}
      className="flex flex-col h-screen bg-background overflow-hidden"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      
      {/* Minimal Header - compact on mobile */}
      <header className="flex items-center justify-between px-2 md:px-4 py-2 md:py-3 border-b border-border bg-card shrink-0">
        <div className="flex-1 min-w-0">
          {/* Short title on mobile (just puzzle number), full title on desktop */}
          <h1 className="text-base md:text-xl font-serif font-bold truncate">
            <span className="md:hidden">#{puzzle.puzzleId || puzzle.title.match(/\d{4}/)?.[0] || puzzle.title}</span>
            <span className="hidden md:inline">{puzzle.title}</span>
          </h1>
        </div>
        
        <div className="relative">
          <Button variant="ghost" size="icon" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-lg shadow-lg z-50">
              <div className="p-4 space-y-4">
                
                {/* Zoom Controls */}
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide">Zoom</label>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setZoom(Math.max(0.1, zoom - 0.1))}
                      className="px-3"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center">
                      <input
                        type="number"
                        min="10"
                        max="200"
                        value={Math.round(zoom * 100)}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setZoom(Math.max(0.1, Math.min(2, val / 100)));
                          }
                        }}
                        className="w-16 text-center border border-border rounded px-2 py-1 text-sm"
                      />
                      <span className="ml-1 text-sm">%</span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                      className="px-3"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Button variant="secondary" size="sm" onClick={checkClue} disabled={!activeClue} className="w-full justify-start">
                    <Check className="mr-2 h-4 w-4" /> Check Clue
                  </Button>
                  
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={revealClue} 
                    disabled={!activeClue} 
                    className="w-full justify-start"
                  >
                    <Eye className="mr-2 h-4 w-4" /> Reveal Clue
                  </Button>

                  <Button variant="ghost" size="sm" onClick={checkPuzzle} className="w-full justify-start">
                    <Check className="mr-2 h-4 w-4" /> Check Puzzle
                  </Button>
                  
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={revealPuzzle} 
                    className="w-full justify-start"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Reveal Puzzle
                  </Button>
                  
                  {onSubmit && !isSubmitted && (
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={onSubmit}
                      className="w-full justify-start bg-green-600 hover:bg-green-700 mt-2"
                      data-testid="button-submit-crossword"
                    >
                      <Send className="mr-2 h-4 w-4" /> Submit
                    </Button>
                  )}
                  
                  {isSubmitted && (
                    <div className="text-sm text-green-600 font-medium text-center py-2 bg-green-50 rounded mt-2">
                      Submitted
                    </div>
                  )}
                </div>

                {/* Recent Sessions */}
                {recentSessions && recentSessions.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <p className="text-xs font-medium uppercase tracking-wide">Recent Sessions</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {recentSessions.map(session => (
                        <button
                          key={session.id}
                          onClick={() => {
                            setMenuOpen(false);
                            onSessionSelect?.(session.id);
                          }}
                          className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm truncate"
                        >
                          {session.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </header>

      {/* Hidden input for mobile keyboard */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={handleHiddenInput}
        onKeyDown={handleHiddenKeyDown}
        className="sr-only"
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          opacity: 0
        }}
        aria-label="Crossword input"
      />

      {/* Main Content - Simple stacked layout: Grid first, Clues below */}
      {clueInputMode ? (
        // Focused input screen
        <main className="flex flex-1 overflow-hidden flex-col">
          {/* Header with back button, clue text, and immediate answer input */}
          <div className="p-4 bg-card border-b border-border space-y-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setClueInputMode(false); setActiveInputClue(null); longPressTriggered.current = false; }}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex-1 space-y-1">
                <div className="text-2xl font-serif font-bold leading-snug">{activeInputClue?.number} {activeInputClue?.direction === "across" ? "Across" : "Down"}</div>
                <div className="text-lg text-muted-foreground leading-snug">{activeInputClue?.text}</div>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Answer</label>
              <input
                ref={clueAnswerInputRef}
                value={clueInputValue}
                onChange={(e) => {
                  const nextVal = e.target.value.toUpperCase();
                  setClueInputValue(nextVal);
                  if (activeInputClue) {
                    writeClueToGrid(activeInputClue, nextVal);
                  }
                }}
                className="w-full rounded-md border border-border bg-white px-3 py-3 text-2xl font-mono tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-amber-500"
                inputMode="text"
                autoFocus
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder={activeInputClue ? `${activeInputClue.length} letters` : ""}
              />
            </div>
          </div>
          {/* Grid showing only the clue's cells */}
          <div className="flex-1 overflow-auto p-4">
            <div className="bg-card rounded-lg shadow-sm border border-border/50 p-4 max-w-full">
              {activeInputClue && (() => {
                // Calculate word lengths from wordBoundaries
                const wordBoundaries = activeInputClue.wordBoundaries || [];
                const wordLengths: number[] = [];
                let start = 0;
                for (let boundary of wordBoundaries) {
                  if (boundary > start) {
                    wordLengths.push(boundary - start);
                    start = boundary;
                  }
                }
                if (start < activeInputClue.length) {
                  wordLengths.push(activeInputClue.length - start);
                }
                if (wordLengths.length === 0) {
                  wordLengths.push(activeInputClue.length);
                }

                // Calculate rows: group words into rows of max 13 cells
                const rows: number[][] = [];
                let currentRow: number[] = [];
                let currentLength = 0;
                for (let wordLen of wordLengths) {
                  if (wordLen > 13) {
                    // Long word: break into rows of 13
                    if (currentRow.length > 0) {
                      rows.push(currentRow);
                      currentRow = [];
                      currentLength = 0;
                    }
                    let remaining = wordLen;
                    while (remaining > 0) {
                      const take = Math.min(remaining, 13);
                      rows.push([take]);
                      remaining -= take;
                    }
                  } else if (currentLength + wordLen <= 13) {
                    currentRow.push(wordLen);
                    currentLength += wordLen;
                  } else {
                    rows.push(currentRow);
                    currentRow = [wordLen];
                    currentLength = wordLen;
                  }
                }
                if (currentRow.length > 0) {
                  rows.push(currentRow);
                }

                // Now render the grid rows
                let cellIndex = 0;
                return (
                  <div className="space-y-2 select-none">
                    {rows.map((row, rowIndex) => (
                      <div 
                        key={rowIndex}
                        className="grid gap-1 justify-center"
                        style={{
                          gridTemplateColumns: `repeat(${row.reduce((a, b) => a + b, 0)}, 1fr)`
                        }}
                      >
                        {row.map((wordLen, wordIndex) => 
                          Array.from({ length: wordLen }, (_, i) => {
                            const globalIndex = cellIndex++;
                            let r = activeInputClue.row - 1;
                            let c = activeInputClue.col - 1;
                            for (let j = 0; j < globalIndex; j++) {
                              if (activeInputClue.direction === "across") c++;
                              else r++;
                            }
                            const isActive = activeCell?.row === r && activeCell?.col === c;
                            const displayValue = getDisplayValue(r, c);
                            const isError = isCellError(r, c);
                            const submittedStatus = getCellSubmittedStatus(r, c);
                            const hasRightBoundary = boundaryMap[`${r}-${c}`]?.right;
                            const hasBottomBoundary = boundaryMap[`${r}-${c}`]?.bottom;
                            return (
                              <div 
                                key={`${r}-${c}`}
                                onClick={() => !isSubmitted && handleCellClick(r, c)}
                                className={cn(
                                  "relative flex items-center justify-center font-sans font-bold uppercase transition-colors duration-75 touch-manipulation w-12 h-12 border",
                                  isSubmitted ? "cursor-default" : "cursor-pointer",
                                  "bg-white",
                                  !isSubmitted && isActive ? "bg-amber-200 text-amber-900 z-10 ring-2 ring-amber-500" : "",
                                  !isSubmitted && isError ? "text-red-600 bg-red-50" : "",
                                  submittedStatus.isMissing ? "text-blue-600" : "",
                                  submittedStatus.isIncorrect ? "text-red-600" : "",
                                  hasRightBoundary ? "border-r-2 border-r-gray-400" : "",
                                  hasBottomBoundary ? "border-b-2 border-b-gray-400" : ""
                                )}
                                style={{ fontSize: '1.5rem' }}
                              >
                                {displayValue}
                              </div>
                            );
                          })
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </main>
      ) : (
        // Normal layout
        <main className="flex flex-1 overflow-hidden flex-col md:flex-row">
          
          {/* Grid Section - Always first visually, flex to fill remaining space on mobile */}
          <div className="flex flex-col items-center w-full flex-1 p-1 md:p-4 md:order-2 overflow-auto min-h-0">
            <div 
              className="bg-card rounded-lg shadow-sm border border-border/50 p-1 md:p-4 max-w-full"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <div 
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                  width: 'fit-content',
                  height: 'fit-content'
                }}
              >
                <div 
                  className="grid gap-0 select-none"
                  style={{
                    gridTemplateColumns: `repeat(${puzzle.size.cols}, 32px)`,
                    backgroundColor: '#1a1a1a',
                    padding: '1px',
                    gap: '1px'
                  }}
                >
                  {puzzle.grid.map((rowStr, r) => (
                    rowStr.split('').map((cellChar, c) => {
                      const isBlack = cellChar === "#";
                      const isActive = activeCell?.row === r && activeCell?.col === c;
                      const isInClue = !isBlack && isCellInActiveClue(r, c);
                      const number = puzzle.numbers[r][c];
                      const displayValue = getDisplayValue(r, c);
                      const isError = isCellError(r, c);
                      const submittedStatus = getCellSubmittedStatus(r, c);

                      return (
                        <div 
                          key={`${r}-${c}`}
                          onClick={() => !isSubmitted && handleCellClick(r, c)}
                          className={cn(
                            "relative flex items-center justify-center font-sans font-bold uppercase transition-colors duration-75 touch-manipulation",
                            isSubmitted ? "cursor-default" : "cursor-pointer",
                            isBlack ? "bg-black" : "bg-white",
                            !isSubmitted && isActive ? "bg-amber-200 text-amber-900 z-10 ring-2 ring-amber-500" : "",
                            !isSubmitted && !isActive && isInClue ? "bg-amber-100" : "",
                            !isSubmitted && isError ? "text-red-600 bg-red-50" : "",
                            submittedStatus.isMissing ? "text-blue-600" : "",
                            submittedStatus.isIncorrect ? "text-red-600" : ""
                          )}
                          style={{ width: '32px', height: '32px', fontSize: '1.1rem' }}
                        >
                          {!isBlack && number && (
                            <span 
                              className="font-mono text-gray-600 absolute"
                              style={{ fontSize: '9px', top: '1px', left: '2px' }}
                            >
                              {number}
                            </span>
                          )}
                          {!isBlack && displayValue}
                        </div>
                      );
                    })
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Draggable separator - mobile only */}
          <div 
            className="md:hidden flex items-center justify-center h-5 bg-muted/40 border-y border-border cursor-row-resize touch-none select-none shrink-0"
            onMouseDown={handleSeparatorStart}
            onTouchStart={handleSeparatorStart}
          >
            <div className="w-16 h-1.5 bg-muted-foreground/50 rounded-full" />
          </div>
          
          {/* Clue List - Below grid on mobile (resizable), left side on desktop (full height) */}
          <div 
            className="bg-card flex flex-col flex-none md:flex-1 md:order-1 md:border-t-0 md:border-r border-border md:w-80 md:max-w-80 min-h-0 overflow-hidden"
            style={{ height: isMobile ? `${cluePanelHeight}px` : '100%' }}
          >
              <div className="hidden md:block p-3 bg-muted/20 border-b border-border">
                  <h2 className="font-serif font-bold text-sm">Clues</h2>
              </div>

              <Tabs value={direction} onValueChange={(v) => setDirection(v as "across" | "down")} className="flex-1 flex flex-col overflow-hidden min-h-0">
                  <div className="px-2 pt-1 md:pt-2">
                      <TabsList className="w-full grid grid-cols-2 h-8 md:h-10">
                          <TabsTrigger value="across" className="text-xs md:text-sm py-1">Across</TabsTrigger>
                          <TabsTrigger value="down" className="text-xs md:text-sm py-1">Down</TabsTrigger>
                      </TabsList>
                  </div>
                  
                    {["across", "down"].map((dir) => (
                      <TabsContent key={dir} value={dir} className="flex-1 overflow-hidden mt-1 p-0 min-h-0">
                        <div className="h-full overflow-auto">
                          <div className="px-2 pb-4 space-y-0.5">
                                  {puzzle.clues[dir as "across"|"down"].map((clue) => {
                                      const isActive = activeClue?.number === clue.number && activeClue?.direction === dir;
                                      const isFilled = isClueFilled(clue);
                                      
                                      return (
                                          <div key={getClueId(clue)} className="space-y-1">
                                            <button
                                              ref={isActive ? activeClueRef : undefined}
                                              onClick={() => handleClueClick(clue)}
                                              onPointerDown={(e) => handleCluePointerDown(clue, e)}
                                              onPointerUp={handleCluePointerUp}
                                              onPointerMove={handleCluePointerMove}
                                              onPointerCancel={handleCluePointerUp}
                                              onPointerLeave={handleCluePointerUp}
                                              className={cn(
                                                  "w-full text-left p-2 rounded-md transition-all flex items-start gap-2 group relative",
                                                  isActive 
                                                      ? "bg-accent/40 text-foreground" 
                                                      : "hover:bg-muted/50 text-muted-foreground"
                                              )}
                                            >
                                                <span className={cn(
                                                    "font-bold font-mono shrink-0 w-6 text-sm md:w-5 md:text-xs",
                                                    isActive ? "text-primary" : "text-muted-foreground/70",
                                                    isFilled && !isActive && "line-through opacity-50"
                                                )}>
                                                    {clue.number}
                                                </span>
                                                <div className="space-y-0.5 min-w-0 flex-1">
                                                    <span className={cn(
                                                        "block leading-tight text-base md:text-sm",
                                                        isActive ? "font-medium" : "",
                                                        isFilled && !isActive && "line-through opacity-60"
                                                    )}>
                                                        {clue.text}
                                                    </span>
                                                    <span className="text-xs md:text-[10px] text-muted-foreground/60">
                                                        ({clue.enumeration})
                                                    </span>
                                                    {isSubmitted && clue.answer && (
                                                      <span className="block text-[11px] font-medium text-green-700 mt-1">
                                                        {clue.answer}
                                                      </span>
                                                    )}
                                                </div>
                                            </button>
                                            {isSubmitted && clue.explanation && (
                                              <div className="ml-7 mr-2 p-2 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-800 leading-relaxed">
                                                <div className="flex items-start gap-1">
                                                  <HelpCircle className="h-3 w-3 mt-0.5 shrink-0 text-blue-500" />
                                                  <span>{clue.explanation}</span>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                      );
                                  })}
                                </div>
                              </div>
                      </TabsContent>
                  ))}
              </Tabs>
          </div>
        </main>
      )}

    </div>
  );
}
