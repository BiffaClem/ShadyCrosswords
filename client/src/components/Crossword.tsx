import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PuzzleData, Clue, Position } from "@/lib/crossword-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Eye, RotateCcw, Upload, BookOpen, Menu, X, Trash2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { puzzleStorage } from "@/lib/puzzle-storage";

interface CrosswordProps {
  initialPuzzle?: PuzzleData;
}

type Difficulty = "normal" | "easy" | "learner";

const getClueId = (clue: Clue) => `${clue.direction}-${clue.number}`;

export default function Crossword({ initialPuzzle }: CrosswordProps) {
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(initialPuzzle || null);
  const [gridState, setGridState] = useState<string[][]>([]);
  const [activeCell, setActiveCell] = useState<Position | null>(null);
  const [direction, setDirection] = useState<"across" | "down">("across");
  const [showErrors, setShowErrors] = useState<boolean>(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [menuOpen, setMenuOpen] = useState(false);
  const [puzzleLibrary, setPuzzleLibrary] = useState(puzzleStorage.getPuzzles());

  // Initialize grid state when puzzle loads
  useEffect(() => {
    if (puzzle) {
      const rows = puzzle.size.rows;
      const cols = puzzle.size.cols;
      
      // Try to load saved progress
      const savedProgress = puzzleStorage.getProgress(puzzle.puzzleId);
      if (savedProgress) {
        setGridState(savedProgress);
      } else {
        const newGrid = Array(rows).fill(null).map(() => Array(cols).fill(""));
        setGridState(newGrid);
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
  }, [puzzle]);

  // Save progress whenever grid changes
  useEffect(() => {
    if (puzzle && gridState.length) {
      puzzleStorage.saveProgress(puzzle.puzzleId, gridState);
    }
  }, [gridState, puzzle]);

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
      const newGrid = [...gridState];
      newGrid[row][col] = "";
      setGridState(newGrid);
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
      const newGrid = [...gridState];
      newGrid[row][col] = e.key.toUpperCase();
      setGridState(newGrid);
      moveCursorTyping(1);
      return;
    }

    if (e.key === "ArrowUp") moveSelectionByArrow(-1, 0);
    if (e.key === "ArrowDown") moveSelectionByArrow(1, 0);
    if (e.key === "ArrowLeft") moveSelectionByArrow(0, -1);
    if (e.key === "ArrowRight") moveSelectionByArrow(0, 1);

  }, [puzzle, activeCell, gridState, direction, moveCursorTyping, moveSelectionByArrow, toggleDirection]);

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
  };

  const handleClueClick = (clue: Clue) => {
    setActiveCell({ row: clue.row - 1, col: clue.col - 1 });
    setDirection(clue.direction);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        puzzleStorage.savePuzzle(json);
        setPuzzleLibrary(puzzleStorage.getPuzzles());
        setPuzzle(json);
        setMenuOpen(false);
        toast({
          title: "Puzzle Loaded",
          description: json.title,
        });
      } catch (err) {
        toast({
          title: "Error",
          description: "Invalid JSON file",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  };

  const selectPuzzleFromLibrary = (puzzleId: string) => {
    const p = puzzleStorage.getPuzzleById(puzzleId);
    if (p) {
      setPuzzle(p);
      setMenuOpen(false);
    }
  };

  const deletePuzzleFromLibrary = (puzzleId: string) => {
    puzzleStorage.deletePuzzle(puzzleId);
    setPuzzleLibrary(puzzleStorage.getPuzzles());
    toast({
      title: "Puzzle Deleted",
      description: "The puzzle and its progress have been removed.",
    });
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
          <h1 className="text-4xl font-serif font-bold">Cryptic Crossword</h1>
          <p className="text-muted-foreground">Load or select a puzzle to begin</p>
        </div>

        <div className="space-y-4 w-full max-w-sm">
          <Button onClick={() => document.getElementById('file-upload')?.click()} className="w-full" size="lg">
              <Upload className="mr-2 h-4 w-4" /> Load New Puzzle
          </Button>

          {puzzleLibrary.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Or continue a puzzle:</p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {puzzleLibrary.map(stored => (
                  <button
                    key={stored.id}
                    onClick={() => selectPuzzleFromLibrary(stored.id)}
                    className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="font-medium">{stored.data.title}</div>
                    <div className="text-xs text-muted-foreground">{stored.data.source.site}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <input 
            id="file-upload" 
            type="file" 
            accept=".json" 
            className="hidden" 
            onChange={handleFileUpload}
        />
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
                
                {/* Difficulty */}
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide">Mode</label>
                  <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="easy">Easy (Reveal)</SelectItem>
                      <SelectItem value="learner">Learner (Hints)</SelectItem>
                    </SelectContent>
                  </Select>
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
                    disabled={!activeClue || difficulty === "normal"} 
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
                    disabled={difficulty === "normal"}
                    className="w-full justify-start"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" /> Reveal Puzzle
                  </Button>
                </div>

                {/* Puzzle Library */}
                <div className="space-y-2 pt-2 border-t border-border max-h-64 overflow-y-auto">
                  <p className="text-xs font-medium uppercase tracking-wide">Puzzles</p>
                  <Button onClick={() => document.getElementById('file-upload-menu')?.click()} variant="outline" size="sm" className="w-full justify-start">
                    <Plus className="mr-2 h-4 w-4" /> Load New
                  </Button>
                  
                  <div className="space-y-1">
                    {puzzleLibrary.map(stored => (
                      <div key={stored.id} className="flex items-center gap-2 text-sm">
                        <button
                          onClick={() => selectPuzzleFromLibrary(stored.id)}
                          className="flex-1 text-left p-2 rounded hover:bg-muted/50 transition-colors truncate"
                        >
                          {stored.data.title}
                        </button>
                        <button
                          onClick={() => deletePuzzleFromLibrary(stored.id)}
                          className="p-1 hover:bg-destructive/10 rounded transition-colors"
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* Grid Section */}
        <div className="flex-1 flex flex-col overflow-auto p-4 lg:p-8 items-center justify-start gap-4">
            {/* Grid */}
            <div className="bg-card p-4 rounded-xl shadow-sm border border-border/50">
                <div 
                    className="grid gap-px bg-border border border-border select-none"
                    style={{
                        gridTemplateColumns: `repeat(${puzzle.size.cols}, minmax(1.5rem, 3.5rem))`,
                        width: 'fit-content'
                    }}
                >
                    {puzzle.grid.map((rowStr, r) => (
                        rowStr.split('').map((cellChar, c) => {
                            const isBlack = cellChar === "#";
                            const isActive = activeCell?.row === r && activeCell?.col === c;
                            const isInClue = !isBlack && isCellInActiveClue(r, c);
                            const number = puzzle.numbers[r][c];
                            const value = gridState[r]?.[c] || "";
                            const isError = isCellError(r, c);
                            const boundary = boundaryMap[`${r}-${c}`];

                            return (
                                <div 
                                    key={`${r}-${c}`}
                                    onClick={() => handleCellClick(r, c)}
                                    className={cn(
                                        "relative aspect-square flex items-center justify-center text-lg sm:text-2xl lg:text-3xl font-sans font-bold uppercase transition-colors duration-75 cursor-pointer",
                                        isBlack ? "bg-black" : "bg-white",
                                        isActive ? "bg-accent text-accent-foreground z-10" : "",
                                        !isActive && isInClue ? "bg-accent/30" : "",
                                        isError ? "text-destructive bg-destructive/10" : "",
                                        boundary?.right ? "border-r-4 border-r-border/80" : "",
                                        boundary?.bottom ? "border-b-4 border-b-border/80" : ""
                                    )}
                                >
                                    {!isBlack && number && (
                                        <span className="crossword-cell-number text-[0.5rem] sm:text-[0.6rem] font-mono text-muted-foreground/80">
                                            {number}
                                        </span>
                                    )}
                                    {!isBlack && value}
                                </div>
                            );
                        })
                    ))}
                </div>
            </div>

            {/* Learner Mode Explanation */}
            {(difficulty === "learner" && activeClue) && (
                 <div className="w-full max-w-2xl bg-card p-6 rounded-lg border border-border shadow-sm">
                     <div className="flex items-center gap-2 mb-2">
                         <BookOpen className="w-5 h-5 text-primary" />
                         <h3 className="font-semibold text-sm">{activeClue.number} {activeClue.direction}</h3>
                     </div>
                     <p className="text-sm italic text-muted-foreground border-l-4 border-accent pl-3">
                         {activeClue.explanation || "No explanation provided."}
                     </p>
                 </div>
            )}
        </div>

        {/* Clue List (Hidden on small screens) */}
        <div className="hidden lg:flex w-80 border-l border-border bg-card flex-col shrink-0">
            <div className="p-3 bg-muted/20 border-b border-border">
                <h2 className="font-serif font-bold text-sm">Clues</h2>
            </div>

            <Tabs defaultValue="across" className="flex-1 flex flex-col overflow-hidden">
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
                                        <button
                                        key={getClueId(clue)}
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
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </TabsContent>
                ))}
            </Tabs>
        </div>
      </main>

      <input 
        id="file-upload-menu" 
        type="file" 
        accept=".json" 
        className="hidden" 
        onChange={handleFileUpload}
      />
    </div>
  );
}
