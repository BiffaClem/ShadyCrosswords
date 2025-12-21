import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PuzzleData, Clue, Position } from "@/lib/crossword-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Eye, RotateCcw, Menu, X, ZoomIn, ZoomOut, Send, HelpCircle } from "lucide-react";
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
  onSave?: (grid: string[][]) => void;
  onSubmit?: () => void;
  isSubmitted?: boolean;
  isCollaborative?: boolean;
  recentSessions?: RecentSession[];
  onSessionSelect?: (sessionId: string) => void;
}

const getClueId = (clue: Clue) => `${clue.direction}-${clue.number}`;

export default function Crossword({ initialPuzzle, initialGrid, onCellChange, onSave, onSubmit, isSubmitted, isCollaborative, recentSessions, onSessionSelect }: CrosswordProps) {
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(initialPuzzle || null);
  const [gridState, setGridState] = useState<string[][]>(initialGrid || []);
  const [activeCell, setActiveCell] = useState<Position | null>(null);
  const [direction, setDirection] = useState<"across" | "down">("across");
  const [showErrors, setShowErrors] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Detect mobile on initial render only
  const isMobileInitial = typeof window !== 'undefined' && (
    window.matchMedia('(max-width: 768px)').matches || 'ontouchstart' in window
  );
  const [isMobile, setIsMobile] = useState(isMobileInitial);
  const [zoom, setZoom] = useState(isMobileInitial ? 0.5 : 1);
  const [hasInitializedZoom, setHasInitializedZoom] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  
  // Detect mobile for layout purposes, but only set zoom once
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.matchMedia('(max-width: 768px)').matches || 
                     ('ontouchstart' in window);
      setIsMobile(mobile);
    };
    
    // Set initial zoom only once
    if (!hasInitializedZoom) {
      const mobile = window.matchMedia('(max-width: 768px)').matches || 
                     ('ontouchstart' in window);
      setZoom(mobile ? 0.5 : 1);
      setHasInitializedZoom(true);
    }
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [hasInitializedZoom]);

  // Update grid when initialGrid prop changes (for real-time collaboration)
  useEffect(() => {
    if (initialGrid && initialGrid.length > 0) {
      setGridState(initialGrid);
    }
  }, [initialGrid]);

  // Initialize grid state when puzzle loads
  useEffect(() => {
    if (puzzle && gridState.length === 0) {
      const rows = puzzle.size.rows;
      const cols = puzzle.size.cols;
      
      // Try to load saved progress from localStorage (fallback for non-session mode)
      if (!initialGrid) {
        const savedProgress = puzzleStorage.getProgress(puzzle.puzzleId);
        if (savedProgress) {
          setGridState(savedProgress);
        } else {
          const newGrid = Array(rows).fill(null).map(() => Array(cols).fill(""));
          setGridState(newGrid);
        }
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
  }, [puzzle, initialGrid]);

  // Save progress whenever grid changes (with debounce for server saves)
  useEffect(() => {
    if (puzzle && gridState.length) {
      // Always save to localStorage
      puzzleStorage.saveProgress(puzzle.puzzleId, gridState);
      
      // Debounce server saves
      if (onSave) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          onSave(gridState);
        }, 2000);
      }
    }
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [gridState, puzzle, onSave]);

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
    
    const userValue = (gridState[r]?.[c] || "").toUpperCase();
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
    
    const userValue = gridState[r]?.[c] || "";
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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!puzzle || !activeCell) return;

    const { row, col } = activeCell;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      const newGrid = gridState.map(r => [...r]);
      newGrid[row][col] = "";
      setGridState(newGrid);
      if (onCellChange) onCellChange(row, col, "", newGrid);
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
      const newGrid = gridState.map(r => [...r]);
      const value = e.key.toUpperCase();
      newGrid[row][col] = value;
      setGridState(newGrid);
      if (onCellChange) onCellChange(row, col, value, newGrid);
      moveCursorTyping(1);
      return;
    }

    if (e.key === "ArrowUp") moveSelectionByArrow(-1, 0);
    if (e.key === "ArrowDown") moveSelectionByArrow(1, 0);
    if (e.key === "ArrowLeft") moveSelectionByArrow(0, -1);
    if (e.key === "ArrowRight") moveSelectionByArrow(0, 1);

  }, [puzzle, activeCell, gridState, direction, moveCursorTyping, moveSelectionByArrow, toggleDirection, onCellChange]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

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

  const handleCellClick = (r: number, c: number) => {
    if (!puzzle) return;
    if (puzzle.grid[r][c] === "#") return;

    if (activeCell?.row === r && activeCell?.col === c) {
      toggleDirection();
    } else {
      setActiveCell({ row: r, col: c });
    }
    
    // Focus hidden input on mobile to invoke keyboard
    if (isMobile && hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  };
  
  // Handle mobile keyboard input via hidden input
  const handleHiddenInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!puzzle || !activeCell) return;
    
    const value = e.target.value.toUpperCase();
    if (value.length > 0 && value.match(/[A-Z]/)) {
      const char = value[value.length - 1]; // Get last character typed
      const { row, col } = activeCell;
      const newGrid = gridState.map(r => [...r]);
      newGrid[row][col] = char;
      setGridState(newGrid);
      if (onCellChange) onCellChange(row, col, char, newGrid);
      moveCursorTyping(1);
    }
    
    // Clear the input for next character
    e.target.value = '';
  }, [puzzle, activeCell, gridState, onCellChange, moveCursorTyping]);
  
  // Handle backspace on mobile
  const handleHiddenKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!puzzle || !activeCell) return;
    
    if (e.key === 'Backspace') {
      const { row, col } = activeCell;
      const newGrid = gridState.map(r => [...r]);
      newGrid[row][col] = '';
      setGridState(newGrid);
      if (onCellChange) onCellChange(row, col, '', newGrid);
      moveCursorTyping(-1);
    }
  }, [puzzle, activeCell, gridState, onCellChange, moveCursorTyping]);

  const handleClueClick = (clue: Clue) => {
    setActiveCell({ row: clue.row - 1, col: clue.col - 1 });
    setDirection(clue.direction);
    
    // Focus hidden input on mobile
    if (isMobile && hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  };

  const checkPuzzle = () => {
    if (!puzzle) return;
    setShowErrors(true);
    setTimeout(() => setShowErrors(false), 2000); 
  };

  const revealPuzzle = () => {
     if (!puzzle) return;
     if (!confirm("Are you sure you want to reveal the whole puzzle?")) return;
     
     const newGrid = [...gridState];
     puzzle.clues.across.forEach(clue => fillClue(newGrid, clue));
     puzzle.clues.down.forEach(clue => fillClue(newGrid, clue));
     setGridState(newGrid);
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
    const newGrid = [...gridState];
    fillClue(newGrid, activeClue);
    setGridState(newGrid);
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
  
  const isCellError = (r: number, c: number) => {
      if (!puzzle || !showErrors) return false;
      if (!gridState[r] || gridState[r][c] === undefined) return false;
      
      const userVal = gridState[r][c];
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
     if (!gridState.length) return false;
     let r = clue.row - 1;
     let c = clue.col - 1;
     
     if (r < 0 || r >= gridState.length) return false;

     for (let i = 0; i < clue.length; i++) {
        let currR = r;
        let currC = c;
        if (clue.direction === "across") currC += i;
        else currR += i;
        
        if (currR >= gridState.length || !gridState[currR] || currC >= gridState[currR].length) return false;
        
        const val = gridState[currR][currC];
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
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      
      {/* Minimal Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex-1">
          <h1 className="text-xl font-serif font-bold">{puzzle.title}</h1>
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

      {/* Main Content - Responsive layout */}
      <main className={cn(
        "flex flex-1 overflow-hidden",
        isMobile ? "flex-col" : "flex-row"
      )}>
        
        {/* Clue List - Side on desktop, bottom drawer on mobile */}
        <div className={cn(
          "bg-card flex flex-col shrink-0",
          isMobile 
            ? "order-2 h-48 border-t border-border" 
            : "w-80 h-full border-r border-border"
        )}>
            <div className="p-3 bg-muted/20 border-b border-border">
                <h2 className="font-serif font-bold text-sm">Clues</h2>
            </div>

            <Tabs value={direction} onValueChange={(v) => setDirection(v as "across" | "down")} className="flex-1 flex flex-col overflow-hidden">
                <div className="px-2 pt-2">
                    <TabsList className="w-full grid grid-cols-2">
                        <TabsTrigger value="across">Across</TabsTrigger>
                        <TabsTrigger value="down">Down</TabsTrigger>
                    </TabsList>
                </div>
                
                {["across", "down"].map((dir) => (
                    <TabsContent key={dir} value={dir} className="flex-1 overflow-hidden mt-2 p-0">
                        <ScrollArea className="h-full clue-scroll">
                            <div className="px-2 pb-4 space-y-0.5">
                                {puzzle.clues[dir as "across"|"down"].map((clue) => {
                                    const isActive = activeClue?.number === clue.number && activeClue?.direction === dir;
                                    const isFilled = isClueFilled(clue);
                                    
                                    return (
                                        <div key={getClueId(clue)} className="space-y-1">
                                          <button
                                            onClick={() => handleClueClick(clue)}
                                            className={cn(
                                                "w-full text-left p-2 rounded-md text-xs transition-all flex items-start gap-2 group relative",
                                                isActive 
                                                    ? "bg-accent/40 text-foreground" 
                                                    : "hover:bg-muted/50 text-muted-foreground"
                                            )}
                                          >
                                              <span className={cn(
                                                  "font-bold font-mono w-5 shrink-0", 
                                                  isActive ? "text-primary" : "text-muted-foreground/70",
                                                  isFilled && !isActive && "line-through opacity-50"
                                              )}>
                                                  {clue.number}
                                              </span>
                                              <div className="space-y-0.5 min-w-0 flex-1">
                                                  <span className={cn(
                                                      "block leading-tight text-xs", 
                                                      isActive ? "font-medium" : "",
                                                      isFilled && !isActive && "line-through opacity-60"
                                                  )}>
                                                      {clue.text}
                                                  </span>
                                                  <span className="text-[10px] text-muted-foreground/60">
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
                        </ScrollArea>
                    </TabsContent>
                ))}
            </Tabs>
        </div>

        {/* Grid Section - Top on mobile, right on desktop */}
        <div className={cn(
          "flex-1 flex flex-col overflow-auto items-center justify-center",
          isMobile ? "order-1 p-2 gap-2" : "p-4 gap-4"
        )}>
            {/* Mobile: Show active clue prominently */}
            {isMobile && activeClue && (
              <div 
                className="w-full bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
                onClick={() => hiddenInputRef.current?.focus()}
              >
                <div className="flex items-start gap-2">
                  <span className="font-bold text-amber-700">
                    {activeClue.number}{activeClue.direction === 'across' ? 'A' : 'D'}
                  </span>
                  <span className="text-sm text-amber-900 flex-1">{activeClue.text}</span>
                  <span className="text-xs text-amber-500">({activeClue.enumeration})</span>
                </div>
              </div>
            )}
            
            {/* Grid Container - Responsive with aspect ratio */}
            <div className="flex-1 flex items-center justify-center min-w-0 w-full">
              <div 
                className="bg-card p-4 rounded-lg shadow-sm border border-border/50"
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'auto'
                }}
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
                            const boundary = boundaryMap[`${r}-${c}`];
                            const submittedStatus = getCellSubmittedStatus(r, c);

                            return (
                                <div 
                                    key={`${r}-${c}`}
                                    onClick={() => !isSubmitted && handleCellClick(r, c)}
                                    className={cn(
                                        "relative flex items-center justify-center font-sans font-bold uppercase transition-colors duration-75",
                                        isSubmitted ? "cursor-default" : "cursor-pointer",
                                        isBlack ? "bg-black" : "bg-white",
                                        !isSubmitted && isActive ? "bg-amber-200 text-amber-900 z-10 ring-2 ring-amber-500" : "",
                                        !isSubmitted && !isActive && isInClue ? "bg-amber-100" : "",
                                        !isSubmitted && isError ? "text-red-600 bg-red-50" : "",
                                        submittedStatus.isMissing ? "text-blue-600" : "",
                                        submittedStatus.isIncorrect ? "text-red-600" : ""
                                    )}
                                    style={{ 
                                      width: '32px', 
                                      height: '32px',
                                      fontSize: '1.1rem'
                                    }}
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

        </div>
      </main>

    </div>
  );
}
