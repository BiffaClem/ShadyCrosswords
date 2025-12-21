import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Loader2, BookOpen, Users, LogOut, Plus, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";

interface Participant {
  id: string;
  firstName: string | null;
  email: string | null;
}

interface SessionWithStats {
  id: string;
  name: string;
  isCollaborative: boolean;
  createdAt: string;
  percentComplete: number;
  percentCorrect: number;
  participants: Participant[];
}

interface PuzzleWithSessions {
  id: string;
  puzzleId: string;
  title: string;
  data: any;
  sessions: SessionWithStats[];
}

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  
  const [createSessionDialogOpen, setCreateSessionDialogOpen] = useState(false);
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleWithSessions | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [isCollaborative, setIsCollaborative] = useState(false);
  const [difficulty, setDifficulty] = useState<"normal" | "easy" | "learner">("normal");

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/puzzles"] });
  }, [queryClient]);

  const { data: puzzles, isLoading } = useQuery<PuzzleWithSessions[]>({
    queryKey: ["/api/puzzles"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/puzzles");
      return res.json();
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: { puzzleId: string; name: string; isCollaborative: boolean; difficulty: string }) => {
      const res = await apiRequest("POST", "/api/sessions", data);
      return res.json();
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["/api/puzzles"] });
      setCreateSessionDialogOpen(false);
      navigate(`/session/${session.id}`);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
      } else {
        toast({ title: "Failed to create session", variant: "destructive" });
      }
    },
  });

  const getPuzzleNumber = (puzzle: PuzzleWithSessions) => {
    return puzzle.data?.puzzleNumber || puzzle.puzzleId || puzzle.title;
  };

  const handleStartNewSession = (puzzle: PuzzleWithSessions) => {
    setSelectedPuzzle(puzzle);
    setSessionName("");
    setIsCollaborative(false);
    setDifficulty("normal");
    setCreateSessionDialogOpen(true);
  };

  const handleCreateSession = () => {
    if (!selectedPuzzle) return;
    const puzzleNumber = getPuzzleNumber(selectedPuzzle);
    const fullName = sessionName 
      ? `${puzzleNumber} - ${sessionName}`
      : `${puzzleNumber} - Session`;
    
    createSessionMutation.mutate({
      puzzleId: selectedPuzzle.id,
      name: fullName,
      isCollaborative,
      difficulty,
    });
  };

  const getParticipantDisplay = (participants: Participant[]) => {
    if (participants.length === 0) return null;
    const names = participants.map(p => p.firstName || p.email?.split('@')[0] || 'User');
    if (names.length <= 2) {
      return names.join(', ');
    }
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
  };

  return (
    <div className="min-h-screen bg-amber-50 font-serif">
      <header className="border-b border-amber-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-amber-800" />
            <div>
              <h1 className="text-2xl font-bold text-amber-900">Shady Crosswords</h1>
              <p className="text-xs text-amber-700 italic">It's a family thing...</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-amber-700" data-testid="text-username">
              {user?.firstName || user?.email || "User"}
            </span>
            <Button 
              variant="ghost"
              onClick={() => window.location.href = "/api/logout"}
              className="text-amber-700"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-amber-900 mb-6">Puzzles</h2>
          
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
            </div>
          ) : puzzles?.length === 0 ? (
            <Card className="border-amber-200">
              <CardContent className="py-12 text-center">
                <p className="text-amber-600">No puzzles available yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {puzzles?.map((puzzle) => (
                <Card key={puzzle.id} className="border-amber-200" data-testid={`card-puzzle-${puzzle.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-amber-900 text-xl">{puzzle.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {puzzle.data?.size?.rows}x{puzzle.data?.size?.cols} grid
                        </CardDescription>
                      </div>
                      <Button 
                        onClick={() => handleStartNewSession(puzzle)}
                        className="bg-amber-700 hover:bg-amber-800"
                        data-testid={`button-new-session-${puzzle.id}`}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New Session
                      </Button>
                    </div>
                  </CardHeader>
                  
                  {puzzle.sessions.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="border-t border-amber-100 pt-4">
                        <p className="text-sm font-medium text-amber-800 mb-3">Your Sessions</p>
                        <div className="space-y-2">
                          {puzzle.sessions.map((session) => (
                            <div 
                              key={session.id}
                              className="flex items-center justify-between p-3 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer group"
                              onClick={() => navigate(`/session/${session.id}`)}
                              data-testid={`session-${session.id}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-amber-900 truncate">
                                    {session.name}
                                  </span>
                                  {session.isCollaborative && (
                                    <Users className="h-4 w-4 text-amber-600 flex-shrink-0" />
                                  )}
                                </div>
                                {session.participants.length > 0 && (
                                  <p className="text-xs text-amber-600 mt-1">
                                    Participants: {getParticipantDisplay(session.participants)}
                                  </p>
                                )}
                                <div className="flex items-center gap-4 mt-2">
                                  <div className="flex-1 max-w-32">
                                    <div className="flex justify-between text-xs text-amber-600 mb-1">
                                      <span>Complete</span>
                                      <span>{session.percentComplete}%</span>
                                    </div>
                                    <Progress value={session.percentComplete} className="h-2" />
                                  </div>
                                  <div className="flex-1 max-w-32">
                                    <div className="flex justify-between text-xs text-amber-600 mb-1">
                                      <span>Correct</span>
                                      <span>{session.percentCorrect}%</span>
                                    </div>
                                    <Progress 
                                      value={session.percentCorrect} 
                                      className="h-2"
                                    />
                                  </div>
                                </div>
                              </div>
                              <ChevronRight className="h-5 w-5 text-amber-400 group-hover:text-amber-600 ml-4" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={createSessionDialogOpen} onOpenChange={setCreateSessionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start Solving: {selectedPuzzle?.title}</DialogTitle>
            <DialogDescription>
              Create a new solving session
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="session-name">Session Name</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {selectedPuzzle ? getPuzzleNumber(selectedPuzzle) : ''} -
                </span>
                <Input 
                  id="session-name" 
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Session"
                  data-testid="input-session-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Difficulty</Label>
              <RadioGroup value={difficulty} onValueChange={(v) => setDifficulty(v as "normal" | "easy" | "learner")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="normal" id="normal" data-testid="radio-difficulty-normal" />
                  <Label htmlFor="normal" className="font-normal">Normal</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="easy" id="easy" data-testid="radio-difficulty-easy" />
                  <Label htmlFor="easy" className="font-normal">Easy (Reveal answers)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="learner" id="learner" data-testid="radio-difficulty-learner" />
                  <Label htmlFor="learner" className="font-normal">Learner (Hints enabled)</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200">
              <div>
                <Label htmlFor="collaborative">Collaborative Mode</Label>
                <p className="text-sm text-muted-foreground">Allow others to join and solve together</p>
              </div>
              <Switch 
                id="collaborative"
                checked={isCollaborative}
                onCheckedChange={setIsCollaborative}
                data-testid="switch-collaborative"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSessionDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateSession}
              disabled={createSessionMutation.isPending}
              className="bg-amber-700 hover:bg-amber-800"
              data-testid="button-create-session"
            >
              {createSessionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Start Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
