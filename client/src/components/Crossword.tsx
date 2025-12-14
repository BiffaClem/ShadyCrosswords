import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PuzzleData, Clue, Position } from "@/lib/crossword-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Eye, HelpCircle, RotateCcw, Upload, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CrosswordProps {
  initialPuzzle?: PuzzleData;
}

// Helper to get clue ID
const getClueId = (clue: Clue) => `${clue.direction}-${clue.number}`;

export default function Crossword({ initialPuzzle }: CrosswordProps) {
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(initialPuzzle || null);
  const [gridState, setGridState] = useState<string[][]>([]);
  const [activeCell, setActiveCell] = useState<Position | null>(null);
  const [direction, setDirection] = useState<"across" | "down">("across");
  const [showErrors, setShowErrors] = useState<boolean>(false);
  
  // Initialize grid state when puzzle loads
  useEffect(() => {
    if (puzzle) {
      const rows = puzzle.size.rows;
      const cols = puzzle.size.cols;
      const newGrid = Array(rows).fill(null).map(() => Array(cols).fill(""));
      setGridState(newGrid);
      
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

  // Pre-calculate word boundaries
  const boundaryMap = useMemo(() => {
    if (!puzzle) return {};
    const map: Record<string, { right?: boolean; bottom?: boolean }> = {};
    
    const processClues = (clues: Clue[], dir: "across" | "down") => {
        clues.forEach(clue => {
            if (!clue.wordBoundaries) return;
            clue.wordBoundaries.forEach(b => {
                if (b >= clue.length) return; // Ignore end of word
                
                // Calculate cell coordinate before the boundary
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
    
    // Loop until we find a white cell or hit edge
    while (nextR >= 0 && nextR < rows && nextC >= 0 && nextC < cols) {
        if (puzzle.grid[nextR][nextC] === ".") {
            setActiveCell({ row: nextR, col: nextC });
            return;
        }
        // Skip black cell
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
    
    // Find next white cell in current direction
    let found = false;
    let attempts = 0;
    while (!found && attempts < Math.max(rows, cols)) {
      if (direction === "across") {
        nextCol += step;
      } else {
        nextRow += step;
      }
      
      // Check bounds
      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
        break; // Stop at edge
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

  // Handle keyboard input
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!puzzle || !activeCell) return;

    const { row, col } = activeCell;

    // Prevent default scrolling for arrows and space
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      const newGrid = [...gridState];
      newGrid[row][col] = "";
      setGridState(newGrid);
      
      // Move backwards if empty or just always?
      // Standard behavior: Backspace deletes current and moves back.
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

    // Navigation
    if (e.key === "ArrowUp") moveSelectionByArrow(-1, 0);
    if (e.key === "ArrowDown") moveSelectionByArrow(1, 0);
    if (e.key === "ArrowLeft") moveSelectionByArrow(0, -1);
    if (e.key === "ArrowRight") moveSelectionByArrow(0, 1);

  }, [puzzle, activeCell, gridState, direction, moveCursorTyping, moveSelectionByArrow, toggleDirection]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);


  // Active Clue Logic
  const getActiveClue = (): Clue | null => {
    if (!puzzle || !activeCell) return null;
    
    const clues = puzzle.clues[direction];
    const r = activeCell.row + 1;
    const c = activeCell.col + 1;
    
    // Find clue that includes the current cell
    return clues.find(clue => {
      if (direction === "across") {
        return clue.row === r && c >= clue.col && c < clue.col + clue.length;
      } else {
        return clue.col === c && r >= clue.row && r < clue.row + clue.length;
      }
    }) || null;
  };
  
  const activeClue = getActiveClue();
  
  // Also check if we should show the "other direction" clue if the current direction has none
  // (e.g. user clicked a cell but default direction has no clue there)
  useEffect(() => {
      if (!activeClue && puzzle && activeCell) {
          // Try switching direction
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

  // Interactions
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


  // File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setPuzzle(json);
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
  
  // Render Helpers
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


  if (!puzzle) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <h2 className="text-2xl font-serif">No Puzzle Loaded</h2>
        <Button onClick={() => document.getElementById('file-upload')?.click()}>
            <Upload className="mr-2 h-4 w-4" /> Load JSON
        </Button>
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

  // Calculate cell size dynamically or just use responsive grid
  // We use CSS Grid in render

  return (
    <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto p-4 lg:p-8 animate-in fade-in duration-500">
      
      {/* Left Column: Controls & Grid */}
      <div className="flex-1 flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex flex-col space-y-2">
            <h1 className="text-3xl font-serif font-bold tracking-tight">{puzzle.title}</h1>
            <div className="flex items-center text-sm text-muted-foreground gap-2">
                <span>{puzzle.source.site}</span>
                {puzzle.source.url && (
                    <a href={puzzle.source.url} target="_blank" rel="noreferrer" className="hover:underline text-primary">
                       Source
                    </a>
                )}
            </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 pb-2 border-b border-border/40">
            <Button variant="outline" size="sm" onClick={checkClue} disabled={!activeClue}>
                <Check className="mr-2 h-4 w-4" /> Check Clue
            </Button>
            <Button variant="outline" size="sm" onClick={revealClue} disabled={!activeClue}>
                <Eye className="mr-2 h-4 w-4" /> Reveal Clue
            </Button>
            <div className="w-px h-6 bg-border mx-2 self-center hidden sm:block"></div>
             <Button variant="ghost" size="sm" onClick={checkPuzzle}>
                <Check className="mr-2 h-4 w-4" /> Check All
            </Button>
            <Button variant="ghost" size="sm" onClick={revealPuzzle}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reveal All
            </Button>
             <div className="flex-1"></div>
             <Button variant="secondary" size="sm" onClick={() => document.getElementById('file-upload')?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Load New
            </Button>
            <input 
                id="file-upload" 
                type="file" 
                accept=".json" 
                className="hidden" 
                onChange={handleFileUpload}
            />
        </div>

        {/* Grid Container */}
        <div className="w-full flex justify-center bg-card p-4 rounded-xl shadow-sm border border-border/50">
            <div 
                className="grid gap-px bg-border border border-border select-none"
                style={{
                    gridTemplateColumns: `repeat(${puzzle.size.cols}, minmax(1.5rem, 3rem))`,
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
                                    "relative aspect-square flex items-center justify-center text-lg sm:text-2xl font-sans font-bold uppercase transition-colors duration-75 cursor-pointer",
                                    isBlack ? "bg-black" : "bg-white",
                                    isActive ? "bg-accent text-accent-foreground z-10" : "",
                                    !isActive && isInClue ? "bg-accent/30" : "",
                                    isError ? "text-destructive bg-destructive/10" : "",
                                    
                                    // Word Boundaries
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
        
        {/* Explanation Panel */}
        <div className="min-h-[120px] p-6 bg-muted/30 rounded-lg border border-border/50">
             {activeClue ? (
                 <div className="space-y-2 animate-in slide-in-from-bottom-2 duration-300">
                     <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-1 rounded">
                            {activeClue.number} {activeClue.direction}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                            ({activeClue.enumeration})
                        </span>
                     </div>
                     <p className="text-lg font-serif leading-snug">
                         {activeClue.text}
                     </p>
                     
                     <div className="mt-4 pt-4 border-t border-border/40 flex items-start gap-3">
                         <HelpCircle className="w-5 h-5 text-primary mt-0.5" />
                         <div className="space-y-1">
                             <p className="text-sm font-medium">Explanation</p>
                             <p className="text-sm text-muted-foreground italic">
                                 {activeClue.explanation || "No explanation available."}
                             </p>
                         </div>
                     </div>
                 </div>
             ) : (
                 <div className="h-full flex items-center justify-center text-muted-foreground text-sm italic">
                     Select a clue to see details
                 </div>
             )}
        </div>

      </div>

      {/* Right Column: Clue List */}
      <div className="w-full lg:w-[350px] flex flex-col h-[600px] lg:h-[calc(100vh-4rem)] lg:sticky lg:top-8 border border-border rounded-xl bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20">
            <h2 className="font-serif font-bold text-lg">Clues</h2>
        </div>
        
        <Tabs defaultValue="across" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 pt-2">
                <TabsList className="w-full grid grid-cols-2">
                    <TabsTrigger value="across">Across</TabsTrigger>
                    <TabsTrigger value="down">Down</TabsTrigger>
                </TabsList>
            </div>
            
            {["across", "down"].map((dir) => (
                <TabsContent key={dir} value={dir} className="flex-1 overflow-hidden mt-2">
                    <ScrollArea className="h-full clue-scroll">
                        <div className="p-4 space-y-1">
                            {puzzle.clues[dir as "across"|"down"].map((clue) => {
                                const isActive = activeClue?.number === clue.number && activeClue?.direction === dir;
                                return (
                                    <button
                                    key={getClueId(clue)}
                                    onClick={() => handleClueClick(clue)}
                                    className={cn(
                                        "w-full text-left p-3 rounded-md text-sm transition-all hover:bg-muted/50 flex items-start gap-3 group",
                                        isActive ? "bg-accent/40 hover:bg-accent/50 ring-1 ring-border" : ""
                                    )}
                                    >
                                        <span className={cn("font-bold font-mono w-6 shrink-0", isActive ? "text-primary" : "text-muted-foreground")}>
                                            {clue.number}
                                        </span>
                                        <div className="space-y-1">
                                            <span className={cn("block leading-relaxed", isActive ? "font-medium text-foreground" : "text-muted-foreground group-hover:text-foreground")}>
                                                {clue.text}
                                            </span>
                                            <span className="text-xs text-muted-foreground/70">
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

    </div>
  );
}
