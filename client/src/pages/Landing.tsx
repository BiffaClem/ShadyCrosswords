import { Button } from "@/components/ui/button";
import { BookOpen, Users, Puzzle, Brain } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-amber-50 font-serif">
      <header className="border-b border-amber-200 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-amber-800" />
            <h1 className="text-2xl font-bold text-amber-900">Cryptic Crossword</h1>
          </div>
          <Button 
            onClick={() => window.location.href = "/api/login"}
            className="bg-amber-700 hover:bg-amber-800 text-white"
            data-testid="button-login"
          >
            Sign In
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-5xl font-bold text-amber-900 mb-6">
            Solve Cryptic Crosswords Together
          </h2>
          <p className="text-xl text-amber-700 mb-12 max-w-2xl mx-auto">
            A classic newspaper-style crossword experience with modern multiplayer features. 
            Solve puzzles solo or collaborate with friends in real-time.
          </p>

          <Button 
            onClick={() => window.location.href = "/api/login"}
            size="lg"
            className="bg-amber-700 hover:bg-amber-800 text-white text-lg px-8 py-6"
            data-testid="button-get-started"
          >
            Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-24 max-w-5xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md border border-amber-100" data-testid="feature-puzzles">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
              <Puzzle className="h-6 w-6 text-amber-800" />
            </div>
            <h3 className="text-xl font-semibold text-amber-900 mb-2">Upload Puzzles</h3>
            <p className="text-amber-700">
              Import cryptic crosswords in standard formats. Build your personal puzzle library.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md border border-amber-100" data-testid="feature-collaborate">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-amber-800" />
            </div>
            <h3 className="text-xl font-semibold text-amber-900 mb-2">Real-time Collaboration</h3>
            <p className="text-amber-700">
              Invite friends to solve puzzles together. See their progress as they type.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md border border-amber-100" data-testid="feature-progress">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
              <Brain className="h-6 w-6 text-amber-800" />
            </div>
            <h3 className="text-xl font-semibold text-amber-900 mb-2">Track Progress</h3>
            <p className="text-amber-700">
              Your progress is saved automatically. Resume solving whenever you want.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-amber-200 mt-24 py-8 text-center text-amber-600">
        <p>Classic crossword experience for the modern solver</p>
      </footer>
    </div>
  );
}
