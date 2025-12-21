import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, BookOpen, Plus, Upload, Users, Play, LogOut } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";

export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [createSessionDialogOpen, setCreateSessionDialogOpen] = useState(false);
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [isCollaborative, setIsCollaborative] = useState(false);

  const { data: puzzles, isLoading: loadingPuzzles } = useQuery({
    queryKey: ["/api/puzzles"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/puzzles");
      return res.json();
    },
  });

  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ["/api/sessions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/sessions");
      return res.json();
    },
  });

  const uploadPuzzleMutation = useMutation({
    mutationFn: async (puzzleData: any) => {
      const res = await apiRequest("POST", "/api/puzzles", puzzleData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/puzzles"] });
      setUploadDialogOpen(false);
      toast({ title: "Puzzle uploaded successfully" });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
      } else {
        toast({ title: "Failed to upload puzzle", variant: "destructive" });
      }
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: { puzzleId: string; name: string; isCollaborative: boolean }) => {
      const res = await apiRequest("POST", "/api/sessions", data);
      return res.json();
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const puzzleData = JSON.parse(text);
      
      if (!puzzleData.puzzleId) {
        puzzleData.puzzleId = `puzzle-${Date.now()}`;
      }
      if (!puzzleData.title) {
        puzzleData.title = file.name.replace(/\.json$/, "");
      }
      
      uploadPuzzleMutation.mutate(puzzleData);
    } catch (error) {
      toast({ title: "Invalid puzzle file", description: "Please upload a valid JSON puzzle file", variant: "destructive" });
    }
  };

  const handleCreateSession = () => {
    if (!selectedPuzzleId) return;
    createSessionMutation.mutate({
      puzzleId: selectedPuzzleId,
      name: sessionName,
      isCollaborative,
    });
  };

  const loadSamplePuzzle = async () => {
    try {
      const res = await fetch("/sample-puzzle.json");
      const puzzleData = await res.json();
      uploadPuzzleMutation.mutate(puzzleData);
    } catch (error) {
      toast({ title: "Failed to load sample puzzle", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 font-serif">
      <header className="border-b border-amber-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-amber-800" />
            <h1 className="text-2xl font-bold text-amber-900">Cryptic Crossword</h1>
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
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-amber-900">Your Puzzles</h2>
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-amber-700 hover:bg-amber-800" data-testid="button-upload-puzzle">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Puzzle
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload a Puzzle</DialogTitle>
                  <DialogDescription>
                    Upload a cryptic crossword puzzle in JSON format
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="puzzle-file">Puzzle File</Label>
                    <Input 
                      id="puzzle-file" 
                      type="file" 
                      accept=".json"
                      onChange={handleFileUpload}
                      data-testid="input-puzzle-file"
                    />
                  </div>
                  <div className="text-center text-amber-600">or</div>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={loadSamplePuzzle}
                    disabled={uploadPuzzleMutation.isPending}
                    data-testid="button-load-sample"
                  >
                    {uploadPuzzleMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Load Sample Puzzle
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loadingPuzzles ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
            </div>
          ) : puzzles?.length === 0 ? (
            <Card className="border-amber-200">
              <CardContent className="py-12 text-center">
                <p className="text-amber-600 mb-4">No puzzles yet. Upload your first puzzle to get started!</p>
                <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-first">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Puzzle
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
              {puzzles?.map((puzzle: any) => (
                <Card key={puzzle.id} className="border-amber-200 hover:shadow-md transition-shadow" data-testid={`card-puzzle-${puzzle.id}`}>
                  <CardHeader>
                    <CardTitle className="text-amber-900">{puzzle.title}</CardTitle>
                    <CardDescription>
                      {puzzle.data?.size?.rows}x{puzzle.data?.size?.cols} grid
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      className="w-full bg-amber-700 hover:bg-amber-800"
                      onClick={() => {
                        setSelectedPuzzleId(puzzle.id);
                        setSessionName("");
                        setIsCollaborative(false);
                        setCreateSessionDialogOpen(true);
                      }}
                      data-testid={`button-start-puzzle-${puzzle.id}`}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start Solving
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="mt-12">
            <h2 className="text-3xl font-bold text-amber-900 mb-6">Your Sessions</h2>
            
            {loadingSessions ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
              </div>
            ) : sessions?.length === 0 ? (
              <Card className="border-amber-200">
                <CardContent className="py-12 text-center">
                  <p className="text-amber-600">No active sessions. Start solving a puzzle to create one!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sessions?.map((session: any) => (
                  <Card key={session.id} className="border-amber-200 hover:shadow-md transition-shadow" data-testid={`card-session-${session.id}`}>
                    <CardHeader>
                      <CardTitle className="text-amber-900 flex items-center gap-2">
                        {session.name}
                        {session.isCollaborative && (
                          <Users className="h-4 w-4 text-amber-600" />
                        )}
                      </CardTitle>
                      <CardDescription>
                        {session.isCollaborative ? "Collaborative session" : "Solo session"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        className="w-full"
                        variant="outline"
                        onClick={() => navigate(`/session/${session.id}`)}
                        data-testid={`button-resume-session-${session.id}`}
                      >
                        Resume
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Dialog open={createSessionDialogOpen} onOpenChange={setCreateSessionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Solving</DialogTitle>
            <DialogDescription>
              Create a new solving session
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="session-name">Session Name (optional)</Label>
              <Input 
                id="session-name" 
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="My solving session"
                data-testid="input-session-name"
              />
            </div>
            <div className="flex items-center justify-between">
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
