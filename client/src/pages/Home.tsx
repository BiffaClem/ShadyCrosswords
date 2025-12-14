import React, { useEffect, useState } from "react";
import Crossword from "@/components/Crossword";
import { PuzzleData } from "@/lib/crossword-types";
import { Loader2 } from "lucide-react";

export default function Home() {
  const [puzzle, setPuzzle] = useState<PuzzleData | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load the sample puzzle by default
    fetch("/sample-puzzle.json")
      .then((res) => res.json())
      .then((data) => {
        setPuzzle(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load sample puzzle", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-accent selection:text-accent-foreground">
      <main className="container mx-auto py-8">
        <Crossword initialPuzzle={puzzle} />
      </main>
    </div>
  );
}
