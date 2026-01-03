import React, { useState, useEffect } from "react";
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
import { Loader2, BookOpen, Users, LogOut, Plus, ChevronRight, ChevronDown, Trash2, CheckCircle, AlertCircle, Pencil } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError, redirectToLogin } from "@/lib/auth-utils";

interface Participant {
  id: string;
  firstName: string | null;
  email: string | null;
}

interface SessionWithStats {
  id: string;
  name: string;
  ownerId: string;
  isCollaborative: boolean;
  createdAt: string;
  percentComplete: number;
  percentCorrect: number;
  submittedAt: string | null;
  participants: Participant[];
}

interface UserActivity {
  id: string;
  firstName: string | null;
  email: string | null;
  lastActivity: string | null;
}

interface PuzzleWithSessions {
  id: string;
  puzzleId: string;
  title: string;
  data: any;
  sessions: SessionWithStats[];
}

export default function Home() {
  const { user, logout, isLoggingOut } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  
  const [createSessionDialogOpen, setCreateSessionDialogOpen] = useState(false);
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleWithSessions | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [isCollaborative, setIsCollaborative] = useState(true); // Default to collaborative
  const [difficulty, setDifficulty] = useState<"standard" | "beginner" | "expert">("standard");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  
  const [activeTab, setActiveTab] = useState<"all" | "inprogress">("all");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [expandedPuzzles, setExpandedPuzzles] = useState<Set<string>>(new Set());
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [isMobile, setIsMobile] = useState(false);
  const [editNameDialogOpen, setEditNameDialogOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  const { data: userActivity } = useQuery<UserActivity[]>({
    queryKey: ["/api/activity"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/activity");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: allUsers } = useQuery<{ id: string; firstName: string | null; email: string | null }[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return res.json();
    },
  });

  useEffect(() => {
    if (isMobile) {
      // On mobile, automatically expand all puzzles with sessions
      const puzzlesWithSessions = puzzles?.filter(p => p.sessions.length > 0).map(p => p.id) || [];
      setExpandedPuzzles(new Set(puzzlesWithSessions));
    }
  }, [puzzles, isMobile]);

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
        redirectToLogin();
      } else {
        toast({ title: "Failed to create session", variant: "destructive" });
      }
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiRequest("DELETE", `/api/sessions/${sessionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/puzzles"] });
      toast({ title: "Session deleted" });
      setDeleteSessionId(null);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Logging in again...", variant: "destructive" });
        redirectToLogin();
      } else {
        toast({ title: "Failed to delete session", variant: "destructive" });
      }
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async (firstName: string) => {
      const res = await apiRequest("PATCH", "/api/users/me", { firstName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
      toast({ title: "Name updated" });
      setEditNameDialogOpen(false);
      window.location.reload();
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Logging in again...", variant: "destructive" });
        redirectToLogin();
      } else {
        toast({ title: "Failed to update name", variant: "destructive" });
      }
    },
  });

  const handleEditName = () => {
    setNewDisplayName(user?.firstName || "");
    setEditNameDialogOpen(true);
  };

  const handleSaveName = () => {
    if (newDisplayName.trim()) {
      updateNameMutation.mutate(newDisplayName.trim());
    }
  };

  const getPuzzleNumber = (puzzle: PuzzleWithSessions) => {
    return puzzle.data?.puzzleNumber || puzzle.puzzleId || puzzle.title;
  };
  
  // Extract numeric puzzle number for sorting (handles titles like "Times Jumbo Cryptic Crossword 1649")
  const getNumericPuzzleNumber = (puzzle: PuzzleWithSessions): number => {
    const puzzleNum = puzzle.data?.puzzleNumber;
    if (puzzleNum) {
      const num = parseInt(puzzleNum, 10);
      if (!isNaN(num)) return num;
    }
    // Try to extract number from title (e.g., "...Crossword 1649 (2024-01-05)")
    const match = puzzle.title?.match(/(\d{4,})/);
    if (match) return parseInt(match[1], 10);
    return 0;
  };

  const handleStartNewSession = (puzzle: PuzzleWithSessions) => {
    setSelectedPuzzle(puzzle);
    setSessionName("");
    setIsCollaborative(true); // Default to collaborative
    setDifficulty("standard");
    setSelectedUsers([]);
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
      invitees: isCollaborative ? selectedUsers : [],
    } as any);
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

  const getLatestSessionDate = (puzzle: PuzzleWithSessions): Date => {
    if (puzzle.sessions.length === 0) return new Date(0);
    const dates = puzzle.sessions.map(s => new Date(s.createdAt));
    return new Date(Math.max(...dates.map(d => d.getTime())));
  };

  const getPuzzleYear = (puzzle: PuzzleWithSessions): string => {
    const dateStr = puzzle.data?.date;
    if (dateStr) {
      return dateStr.substring(0, 4);
    }
    return "Unknown";
  };

  const availableYears = Array.from(new Set(puzzles?.map(getPuzzleYear) || [])).sort((a, b) => b.localeCompare(a));

  const filteredPuzzles = puzzles?.filter(puzzle => {
    if (selectedYear !== "all" && getPuzzleYear(puzzle) !== selectedYear) {
      return false;
    }
    if (activeTab === "inprogress") {
      return puzzle.sessions.some(s => s.percentComplete > 0 && s.percentComplete < 100);
    }
    if (hideCompleted) {
      const allComplete = puzzle.sessions.length > 0 && puzzle.sessions.every(s => s.percentComplete === 100);
      if (allComplete) return false;
    }
    return true;
  }) || [];

  // Helper to check if puzzle has active (in-progress) sessions
  const hasActiveSession = (puzzle: PuzzleWithSessions): boolean => {
    return puzzle.sessions.some(s => s.percentComplete > 0 && s.percentComplete < 100 && !s.submittedAt);
  };

  const sortedPuzzles = [...filteredPuzzles].sort((a, b) => {
    // Priority 1: In-progress puzzles come first
    const aActive = hasActiveSession(a);
    const bActive = hasActiveSession(b);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    
    // Priority 2: Sort by puzzle number ascending (lowest number first)
    const numA = getNumericPuzzleNumber(a);
    const numB = getNumericPuzzleNumber(b);
    return numA - numB;
  });
  
  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  // Compute metrics
  const allSessions = puzzles?.flatMap(p => p.sessions) || [];
  const totalPuzzles = puzzles?.length || 0;
  const inProgressCount = allSessions.filter(s => s.percentComplete > 0 && s.percentComplete < 100 && !s.submittedAt).length;
  const completedCount = allSessions.filter(s => s.submittedAt).length;
  const totalCorrect = allSessions.reduce((sum, s) => sum + s.percentCorrect * s.percentComplete, 0);
  const totalAttempted = allSessions.reduce((sum, s) => sum + s.percentComplete, 0);
  const overallAccuracy = totalAttempted > 0 ? Math.round(totalCorrect / totalAttempted) : 0;

  const getActivityStatus = (lastActivity: string | null) => {
    if (!lastActivity) return { color: "bg-gray-300", label: "Never active" };
    const diff = Date.now() - new Date(lastActivity).getTime();
    const minutes = diff / (1000 * 60);
    const hours = diff / (1000 * 60 * 60);
    const days = diff / (1000 * 60 * 60 * 24);
    
    if (minutes < 5) return { color: "bg-green-500", label: "Active now" };
    if (hours < 1) return { color: "bg-green-400", label: "Active recently" };
    if (hours < 24) return { color: "bg-amber-500", label: "Active today" };
    if (days < 7) return { color: "bg-orange-400", label: "This week" };
    return { color: "bg-red-400", label: "Inactive" };
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
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={handleEditName}
              className="flex items-center gap-1 text-amber-700 hover:text-amber-900 transition-colors"
              data-testid="button-edit-name"
              title="Edit your display name"
            >
              <span data-testid="text-username">
                {user?.firstName || user?.email || "User"}
              </span>
              <Pencil className="h-3 w-3" />
            </button>
            {user?.role === "admin" && (
              <Button
                variant="outline"
                onClick={() => navigate("/admin")}
                className="text-amber-700 border-amber-300"
                data-testid="button-admin"
              >
                Admin
              </Button>
            )}
            <Button 
              variant="ghost"
              onClick={() => logout()}
              className="text-amber-700"
              data-testid="button-logout"
              disabled={isLoggingOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{isLoggingOut ? "Signing Out" : "Sign Out"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-5xl mx-auto">
          {/* Metrics and Activity Section */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4 mb-4 sm:mb-6">
            <div className="bg-white rounded-lg border border-amber-200 p-3 sm:p-4 text-center" data-testid="metric-total">
              <div className="text-xl sm:text-2xl font-bold text-amber-900">{totalPuzzles}</div>
              <div className="text-sm text-amber-600">Puzzles</div>
            </div>
            <div className="bg-white rounded-lg border border-amber-200 p-3 sm:p-4 text-center" data-testid="metric-progress">
              <div className="text-xl sm:text-2xl font-bold text-amber-700 flex items-center justify-center gap-1">
                <AlertCircle className="h-5 w-5 sm:h-5 sm:w-5" />
                {inProgressCount}
              </div>
              <div className="text-sm text-amber-600">In Progress</div>
            </div>
            <div className="bg-white rounded-lg border border-amber-200 p-3 sm:p-4 text-center" data-testid="metric-complete">
              <div className="text-xl sm:text-2xl font-bold text-green-700 flex items-center justify-center gap-1">
                <CheckCircle className="h-5 w-5 sm:h-5 sm:w-5" />
                {completedCount}
              </div>
              <div className="text-sm text-amber-600">Submitted</div>
            </div>
            <div className="bg-white rounded-lg border border-amber-200 p-3 sm:p-4 text-center" data-testid="metric-accuracy">
              <div className="text-xl sm:text-2xl font-bold text-amber-900">{overallAccuracy}%</div>
              <div className="text-sm text-amber-600">Accuracy</div>
            </div>
            <div className="bg-white rounded-lg border border-amber-200 p-3 sm:p-3 col-span-2 sm:col-span-4 lg:col-span-1" data-testid="metric-activity">
              <div className="text-sm text-amber-600 mb-1 sm:mb-2 font-medium">Who's Online</div>
              <div className="flex flex-wrap gap-2">
                {userActivity?.slice(0, 5).map((u) => {
                  const status = getActivityStatus(u.lastActivity);
                  return (
                    <div 
                      key={u.id} 
                      className="flex items-center gap-1.5"
                      title={`${u.firstName || u.email || 'User'}: ${status.label}`}
                    >
                      <div className={`w-2 h-2 rounded-full ${status.color}`} />
                      <span className="text-sm text-amber-800 truncate max-w-16">
                        {u.firstName || u.email?.split('@')[0] || 'User'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" data-testid="tab-all" className="text-sm sm:text-sm px-3 sm:px-3">All</TabsTrigger>
                  <TabsTrigger value="inprogress" data-testid="tab-inprogress" className="text-sm sm:text-sm px-3 sm:px-3">In Progress</TabsTrigger>
                </TabsList>
              </Tabs>
              
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="text-sm sm:text-sm border border-amber-200 rounded px-3 py-1 bg-white text-amber-800 h-8"
                data-testid="select-year"
              >
                <option value="all">All Years</option>
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            
            <label className="flex items-center gap-2 text-base text-amber-700 cursor-pointer">
              <Checkbox 
                checked={hideCompleted} 
                onCheckedChange={(c) => setHideCompleted(!!c)}
                data-testid="checkbox-hide-completed"
              />
              Hide completed
            </label>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
            </div>
          ) : sortedPuzzles.length === 0 ? (
            <div className="bg-white rounded-lg border border-amber-200 py-12 text-center">
              <p className="text-amber-600 text-base">No puzzles found.</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-amber-100 text-left text-base text-amber-800">
                  <tr>
                    <th className="px-3 sm:px-4 py-3 font-medium">Puzzle</th>
                    <th className="px-3 sm:px-4 py-3 font-medium text-center hidden sm:table-cell">Date</th>
                    <th className="px-3 sm:px-4 py-3 font-medium text-center hidden md:table-cell">Sessions</th>
                    <th className="px-3 sm:px-4 py-3 font-medium text-center">Progress</th>
                    <th className="px-3 sm:px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {sortedPuzzles.map((puzzle) => {
                    const isExpanded = expandedPuzzles.has(puzzle.id);
                    const bestSession = puzzle.sessions.reduce((best, s) => 
                      s.percentComplete > (best?.percentComplete || 0) ? s : best, 
                      null as SessionWithStats | null
                    );
                    
                    return (
                      <React.Fragment key={puzzle.id}>
                        <tr 
                          className={`hover:bg-amber-50 ${isMobile ? '' : 'cursor-pointer'} ${puzzle.sessions.length > 0 ? 'bg-blue-100/50 border-l-4 border-l-blue-400' : ''}`}
                          onClick={() => !isMobile && puzzle.sessions.length > 0 && togglePuzzleExpand(puzzle.id)}
                          data-testid={`row-puzzle-${puzzle.id}`}
                        >
                          <td className="px-3 sm:px-4 py-3">
                            <div className="flex items-center gap-2">
                              {puzzle.sessions.length > 0 && !isMobile && (
                                <ChevronDown className={`h-4 w-4 text-amber-500 transition-transform flex-shrink-0 ${isExpanded ? '' : '-rotate-90'}`} />
                              )}
                              {puzzle.sessions.length > 0 && isMobile && (
                                <ChevronDown className="h-4 w-4 text-amber-500 flex-shrink-0" />
                              )}
                              {/* Show just puzzle number on mobile (larger font), full title on desktop */}
                              <span className="font-medium text-amber-900 text-lg truncate sm:hidden">#{getPuzzleNumber(puzzle)}</span>
                              <span className="font-medium text-amber-900 text-base truncate hidden sm:inline">{puzzle.title}</span>
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-center text-amber-700 text-base hidden sm:table-cell">
                            {formatDate(puzzle.data?.date)}
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-center text-amber-700 text-base hidden md:table-cell">
                            {puzzle.sessions.length}
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-center">
                            {bestSession ? (
                              <div className="flex items-center justify-center gap-1 sm:gap-2">
                                <div className="w-12 sm:w-24 h-2 bg-amber-100 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-amber-600 rounded-full" 
                                    style={{ width: `${bestSession.percentComplete}%` }}
                                  />
                                </div>
                                <span className="text-base text-amber-700">{bestSession.percentComplete}%</span>
                              </div>
                            ) : (
                              <span className="text-amber-400 text-base">-</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-right">
                            <Button 
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleStartNewSession(puzzle); }}
                              className="bg-amber-700 hover:bg-amber-800 px-3 sm:px-3"
                              data-testid={`button-new-session-${puzzle.id}`}
                            >
                              <Plus className="h-4 w-4 sm:mr-1" />
                              <span className="hidden sm:inline">New</span>
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && puzzle.sessions.map((session) => {
                          const isOwner = session.ownerId === user?.id;
                          return (
                            <tr 
                              key={session.id}
                              className={`hover:bg-amber-100/50 cursor-pointer ${session.submittedAt ? 'bg-green-50/50' : 'bg-blue-50/50'}`}
                              onClick={() => navigate(`/session/${session.id}`)}
                              data-testid={`session-${session.id}`}
                            >
                              <td className="px-3 sm:px-4 py-2 pl-6 sm:pl-10" colSpan={1}>
                                <div className="flex items-center gap-1 sm:gap-2">
                                  <span className="text-amber-800 text-base truncate max-w-[120px] sm:max-w-none">{session.name}</span>
                                  {session.isCollaborative && (
                                    <Users className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-amber-600 flex-shrink-0" />
                                  )}
                                  {session.submittedAt && (
                                    <CheckCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-green-600 flex-shrink-0" />
                                  )}
                                </div>
                              </td>
                              <td className="px-3 sm:px-4 py-2 text-center text-sm text-amber-600 hidden sm:table-cell">
                                {session.participants.length > 0 && (
                                  <span>{session.participants.length} participant{session.participants.length !== 1 ? 's' : ''}</span>
                                )}
                              </td>
                              <td className="px-3 sm:px-4 py-2 hidden md:table-cell"></td>
                              <td className="px-3 sm:px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <div className="w-12 sm:w-20 h-2 bg-amber-200 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${session.submittedAt ? 'bg-green-600' : 'bg-amber-600'}`}
                                      style={{ width: `${session.percentComplete}%` }}
                                    />
                                  </div>
                                  <span className="text-sm text-amber-600">{session.percentComplete}%</span>
                                </div>
                              </td>
                              <td className="px-2 sm:px-4 py-2 text-right">
                                <div className="flex items-center justify-end gap-0 sm:gap-2">
                                  {isOwner && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDeleteSessionId(session.id); }}
                                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                      title="Delete session"
                                      data-testid={`button-delete-session-${session.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 sm:h-4 sm:w-4" />
                                    </button>
                                  )}
                                  <ChevronRight className="h-4 w-4 sm:h-4 sm:w-4 text-amber-400" />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
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
              <RadioGroup value={difficulty} onValueChange={(v) => setDifficulty(v as "standard" | "beginner" | "expert")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="standard" id="standard" data-testid="radio-difficulty-standard" />
                  <Label htmlFor="standard" className="font-normal">Standard</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="beginner" id="beginner" data-testid="radio-difficulty-beginner" />
                  <Label htmlFor="beginner" className="font-normal">Beginner (Extra hints)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="expert" id="expert" data-testid="radio-difficulty-expert" />
                  <Label htmlFor="expert" className="font-normal">Expert (No assistance)</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200">
              <div>
                <Label htmlFor="collaborative">Collaborative Mode</Label>
                <p className="text-sm text-muted-foreground">
                  {isCollaborative ? "Invite family members to solve together" : "Solve privately (you can still share the link)"}
                </p>
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
                <Label>Invite Family Members</Label>
                <div className="max-h-40 overflow-y-auto border border-amber-200 rounded-lg p-2 space-y-2">
                  {allUsers.map((user) => (
                    <div key={user.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`user-${user.id}`}
                        checked={selectedUsers.includes(user.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedUsers(prev => [...prev, user.id]);
                          } else {
                            setSelectedUsers(prev => prev.filter(id => id !== user.id));
                          }
                        }}
                      />
                      <Label htmlFor={`user-${user.id}`} className="text-sm font-normal">
                        {user.firstName || user.email?.split('@')[0] || 'User'}
                      </Label>
                    </div>
                  ))}
                </div>
                {selectedUsers.length > 0 && (
                  <p className="text-sm text-amber-600">
                    {selectedUsers.length} member{selectedUsers.length !== 1 ? 's' : ''} will be invited
                  </p>
                )}
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

      <AlertDialog open={!!deleteSessionId} onOpenChange={(open) => !open && setDeleteSessionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this session? This action cannot be undone and will remove all progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteSessionId && deleteSessionMutation.mutate(deleteSessionId)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteSessionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editNameDialogOpen} onOpenChange={setEditNameDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Display Name</DialogTitle>
            <DialogDescription>
              Change how your name appears to others
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <Input 
                id="display-name" 
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Enter your name"
                data-testid="input-display-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditNameDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveName}
              disabled={updateNameMutation.isPending || !newDisplayName.trim()}
              className="bg-amber-700 hover:bg-amber-800"
              data-testid="button-save-name"
            >
              {updateNameMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
