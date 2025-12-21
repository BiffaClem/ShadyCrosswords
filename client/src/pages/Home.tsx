import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, BookOpen, Users, LogOut, Plus, ChevronRight, ChevronDown, Check, X, Mail } from "lucide-react";
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

interface Invite {
  id: string;
  sessionId: string;
  status: string;
  sessionName: string;
  puzzleTitle: string;
  puzzleId: string;
  createdAt: string;
}

interface User {
  id: string;
  firstName: string | null;
  email: string | null;
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
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  
  const [activeTab, setActiveTab] = useState<"all" | "inprogress" | "invites">("all");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [expandedPuzzles, setExpandedPuzzles] = useState<Set<string>>(new Set());

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/puzzles"] });
    queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
  }, [queryClient]);

  const { data: puzzles, isLoading } = useQuery<PuzzleWithSessions[]>({
    queryKey: ["/api/puzzles"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/puzzles");
      return res.json();
    },
  });

  const { data: invites } = useQuery<Invite[]>({
    queryKey: ["/api/invites"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/invites");
      return res.json();
    },
  });

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return res.json();
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: { puzzleId: string; name: string; isCollaborative: boolean; difficulty: string; invitees: string[] }) => {
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

  const respondInviteMutation = useMutation({
    mutationFn: async ({ inviteId, status }: { inviteId: string; status: string }) => {
      const res = await apiRequest("POST", `/api/invites/${inviteId}/respond`, { status });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/puzzles"] });
      toast({ title: variables.status === "accepted" ? "Invite accepted!" : "Invite declined" });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
      } else {
        toast({ title: "Failed to respond to invite", variant: "destructive" });
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
    setSelectedInvitees([]);
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
      invitees: selectedInvitees,
    });
  };

  const togglePuzzleExpand = (puzzleId: string) => {
    setExpandedPuzzles(prev => {
      const next = new Set(prev);
      if (next.has(puzzleId)) {
        next.delete(puzzleId);
      } else {
        next.add(puzzleId);
      }
      return next;
    });
  };

  const toggleInvitee = (userId: string) => {
    setSelectedInvitees(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const pendingInvites = invites?.filter(i => i.status === "pending") || [];

  const filteredPuzzles = puzzles?.filter(puzzle => {
    if (activeTab === "inprogress") {
      return puzzle.sessions.some(s => s.percentComplete > 0 && s.percentComplete < 100);
    }
    if (hideCompleted) {
      const allComplete = puzzle.sessions.length > 0 && puzzle.sessions.every(s => s.percentComplete === 100);
      if (allComplete) return false;
    }
    return true;
  }) || [];

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

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-all">All Puzzles</TabsTrigger>
                <TabsTrigger value="inprogress" data-testid="tab-inprogress">In Progress</TabsTrigger>
                <TabsTrigger value="invites" data-testid="tab-invites" className="relative">
                  Invites
                  {pendingInvites.length > 0 && (
                    <span className="ml-1 bg-amber-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px]">
                      {pendingInvites.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            {activeTab !== "invites" && (
              <label className="flex items-center gap-2 text-sm text-amber-700 cursor-pointer">
                <Checkbox 
                  checked={hideCompleted} 
                  onCheckedChange={(c) => setHideCompleted(!!c)}
                  data-testid="checkbox-hide-completed"
                />
                Hide completed
              </label>
            )}
          </div>
          
          {activeTab === "invites" ? (
            <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
              {pendingInvites.length === 0 ? (
                <div className="py-12 text-center text-amber-600">
                  <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No pending invites</p>
                </div>
              ) : (
                <div className="divide-y divide-amber-100">
                  {pendingInvites.map((invite) => (
                    <div 
                      key={invite.id} 
                      className="flex items-center justify-between p-4 hover:bg-amber-50"
                      data-testid={`invite-${invite.id}`}
                    >
                      <div>
                        <p className="font-medium text-amber-900">{invite.sessionName}</p>
                        <p className="text-sm text-amber-600">{invite.puzzleTitle}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => respondInviteMutation.mutate({ inviteId: invite.id, status: "declined" })}
                          disabled={respondInviteMutation.isPending}
                          data-testid={`button-decline-${invite.id}`}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          className="bg-amber-700 hover:bg-amber-800"
                          onClick={() => respondInviteMutation.mutate({ inviteId: invite.id, status: "accepted" })}
                          disabled={respondInviteMutation.isPending}
                          data-testid={`button-accept-${invite.id}`}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
            </div>
          ) : filteredPuzzles.length === 0 ? (
            <div className="bg-white rounded-lg border border-amber-200 py-12 text-center">
              <p className="text-amber-600">No puzzles found.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-amber-100 text-left text-sm text-amber-800">
                  <tr>
                    <th className="px-4 py-3 font-medium">Puzzle</th>
                    <th className="px-4 py-3 font-medium text-center">Size</th>
                    <th className="px-4 py-3 font-medium text-center">Sessions</th>
                    <th className="px-4 py-3 font-medium text-center">Best Progress</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {filteredPuzzles.map((puzzle) => {
                    const isExpanded = expandedPuzzles.has(puzzle.id);
                    const bestSession = puzzle.sessions.reduce((best, s) => 
                      s.percentComplete > (best?.percentComplete || 0) ? s : best, 
                      null as SessionWithStats | null
                    );
                    
                    return (
                      <>
                        <tr 
                          key={puzzle.id} 
                          className="hover:bg-amber-50 cursor-pointer"
                          onClick={() => puzzle.sessions.length > 0 && togglePuzzleExpand(puzzle.id)}
                          data-testid={`row-puzzle-${puzzle.id}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {puzzle.sessions.length > 0 && (
                                <ChevronDown className={`h-4 w-4 text-amber-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                              )}
                              <span className="font-medium text-amber-900">{puzzle.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-amber-700 text-sm">
                            {puzzle.data?.size?.rows}x{puzzle.data?.size?.cols}
                          </td>
                          <td className="px-4 py-3 text-center text-amber-700 text-sm">
                            {puzzle.sessions.length}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {bestSession ? (
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-24 h-2 bg-amber-100 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-amber-600 rounded-full" 
                                    style={{ width: `${bestSession.percentComplete}%` }}
                                  />
                                </div>
                                <span className="text-sm text-amber-700">{bestSession.percentComplete}%</span>
                              </div>
                            ) : (
                              <span className="text-amber-400 text-sm">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button 
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleStartNewSession(puzzle); }}
                              className="bg-amber-700 hover:bg-amber-800"
                              data-testid={`button-new-session-${puzzle.id}`}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              New
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && puzzle.sessions.map((session) => (
                          <tr 
                            key={session.id}
                            className="bg-amber-50/50 hover:bg-amber-100/50 cursor-pointer"
                            onClick={() => navigate(`/session/${session.id}`)}
                            data-testid={`session-${session.id}`}
                          >
                            <td className="px-4 py-2 pl-10">
                              <div className="flex items-center gap-2">
                                <span className="text-amber-800">{session.name}</span>
                                {session.isCollaborative && (
                                  <Users className="h-3.5 w-3.5 text-amber-600" />
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-center text-xs text-amber-600">
                              {session.participants.length > 0 && (
                                <span>{session.participants.length} participant{session.participants.length !== 1 ? 's' : ''}</span>
                              )}
                            </td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-20 h-1.5 bg-amber-200 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-amber-600 rounded-full" 
                                    style={{ width: `${session.percentComplete}%` }}
                                  />
                                </div>
                                <span className="text-xs text-amber-600">{session.percentComplete}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <ChevronRight className="h-4 w-4 text-amber-400 inline" />
                            </td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
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

            {isCollaborative && allUsers && allUsers.length > 0 && (
              <div className="space-y-2">
                <Label>Invite Users</Label>
                <div className="max-h-32 overflow-y-auto border border-amber-200 rounded-lg divide-y divide-amber-100">
                  {allUsers.map((u) => (
                    <label 
                      key={u.id} 
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-amber-50"
                    >
                      <Checkbox 
                        checked={selectedInvitees.includes(u.id)}
                        onCheckedChange={() => toggleInvitee(u.id)}
                        data-testid={`checkbox-invite-${u.id}`}
                      />
                      <span className="text-sm text-amber-800">
                        {u.firstName || u.email?.split('@')[0] || 'User'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
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
