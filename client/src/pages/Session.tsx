import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Crossword from "@/components/Crossword";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ArrowLeft, Users, Copy, Check, Share2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";

interface SessionData {
  session: any;
  puzzle: any;
  progress: any;
  participants: any[];
}

interface RecentSession {
  id: string;
  name: string;
  puzzleTitle: string;
}

interface ParticipantWithActivity {
  id: string;
  firstName: string | null;
  email: string | null;
  lastActivity: string | null;
  joinedAt: string | null;
  isOwner: boolean;
}

interface ParticipantsData {
  ownerId: string;
  participants: ParticipantWithActivity[];
}

function getActivityStatus(lastActivity: string | null): { label: string; color: string; dotColor: string } {
  if (!lastActivity) {
    return { label: "No activity", color: "text-gray-400", dotColor: "bg-gray-300" };
  }
  
  const now = new Date();
  const activityDate = new Date(lastActivity);
  const diffMs = now.getTime() - activityDate.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;
  
  if (diffHours < 1) {
    return { label: "Active now", color: "text-green-600", dotColor: "bg-green-500" };
  } else if (diffDays < 1) {
    return { label: "Today", color: "text-amber-600", dotColor: "bg-amber-500" };
  } else if (diffDays < 7) {
    return { label: "This week", color: "text-orange-600", dotColor: "bg-orange-500" };
  } else {
    return { label: "Inactive", color: "text-red-400", dotColor: "bg-red-400" };
  }
}

function getActiveCount(participants: ParticipantWithActivity[]): number {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return participants.filter(p => {
    if (!p.lastActivity) return false;
    return new Date(p.lastActivity) > oneHourAgo;
  }).length;
}

function isActiveNow(lastActivity: string | null): boolean {
  if (!lastActivity) return false;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return new Date(lastActivity) > oneHourAgo;
}

export default function Session() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [copied, setCopied] = useState(false);
  const [gridState, setGridState] = useState<string[][] | null>(null);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [sharingOpen, setSharingOpen] = useState(false);

  const { data, isLoading, error } = useQuery<SessionData>({
    queryKey: ["/api/sessions", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sessions/${id}`);
      return res.json();
    },
    retry: false,
  });

  const { data: participantsData, refetch: refetchParticipants } = useQuery<ParticipantsData>({
    queryKey: ["/api/sessions", id, "participants"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sessions/${id}/participants`);
      return res.json();
    },
    enabled: !!id,
    refetchInterval: 30000,
  });

  const { data: allPuzzles } = useQuery<any[]>({
    queryKey: ["/api/puzzles"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/puzzles");
      return res.json();
    },
  });

  const recentSessions: RecentSession[] = allPuzzles?.flatMap(puzzle => 
    (puzzle.sessions ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      puzzleTitle: puzzle.title,
    }))
  ).filter((s: RecentSession) => s.id !== id).slice(0, 5) || [];

  useEffect(() => {
    if (data?.progress?.grid) {
      setGridState(data.progress.grid);
    }
  }, [data?.progress?.grid]);

  useEffect(() => {
    if (!data?.session?.isCollaborative || !user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "join_session",
        sessionId: id,
        userId: user.id,
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === "cell_update") {
        setGridState(prev => {
          if (!prev) return prev;
          const newGrid = prev.map(row => [...row]);
          newGrid[message.row][message.col] = message.value;
          return newGrid;
        });
      }
      
      if (message.type === "user_joined") {
        setActiveUsers(prev => {
          if (prev.includes(message.userId)) return prev;
          return [...prev, message.userId];
        });
        toast({ title: "Someone joined the session" });
        refetchParticipants();
      }
      
      if (message.type === "user_left") {
        setActiveUsers(prev => prev.filter(u => u !== message.userId));
      }
      
      if (message.type === "progress_update") {
        setGridState(message.grid);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, [data?.session?.isCollaborative, user, id, refetchParticipants]);

  const saveProgressMutation = useMutation({
    mutationFn: async (grid: string[][]) => {
      const res = await apiRequest("POST", `/api/sessions/${id}/progress`, { grid });
      return res.json();
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Session expired", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
      }
    }
  });

  const handleCellChange = useCallback((row: number, col: number, value: string, newGrid: string[][]) => {
    setGridState(newGrid);
    
    if (data?.session?.isCollaborative && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "cell_update",
        row,
        col,
        value,
      }));
    }
  }, [data?.session?.isCollaborative]);

  const handleSaveProgress = useCallback((grid: string[][]) => {
    saveProgressMutation.mutate(grid);
  }, [saveProgressMutation]);

  const copyInviteLink = () => {
    const link = `${window.location.origin}/session/${id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast({ title: "Link copied!", description: "Share this link to invite others." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBack = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/puzzles"] });
    navigate("/");
  };

  if (error) {
    if (isUnauthorizedError(error)) {
      toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
      setTimeout(() => { window.location.href = "/api/login"; }, 500);
      return null;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="text-center">
          <p className="text-amber-700 mb-4">Session not found or access denied</p>
          <Button onClick={() => navigate("/")} data-testid="button-go-home">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
      </div>
    );
  }

  const puzzleData = data.puzzle?.data;
  const totalParticipants = participantsData?.participants.length || 0;
  const activeCount = participantsData ? getActiveCount(participantsData.participants) : 0;

  const getDisplayName = (p: { firstName: string | null; email: string | null }) => {
    return p.firstName || p.email?.split('@')[0] || 'User';
  };

  return (
    <div className="min-h-screen bg-amber-50">
      <header className="border-b border-amber-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <Button 
            variant="ghost" 
            onClick={handleBack}
            className="text-amber-700"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-center gap-3">
            <Popover open={sharingOpen} onOpenChange={setSharingOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-amber-300 gap-2"
                  data-testid="button-sharing"
                >
                  <Users className="h-4 w-4" />
                  <span className="text-amber-700">{totalParticipants}</span>
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-green-700">{activeCount}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Session Participants</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={copyInviteLink}
                      className="gap-1"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
                      {copied ? "Copied" : "Copy Link"}
                    </Button>
                  </div>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {participantsData?.participants.map((participant) => {
                      const status = getActivityStatus(participant.lastActivity);
                      return (
                        <div key={participant.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${status.dotColor}`} />
                            <span className={`text-sm ${participant.isOwner ? 'font-medium' : ''}`}>{getDisplayName(participant)}</span>
                            {participant.isOwner && (
                              <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">Owner</span>
                            )}
                          </div>
                          <span className={`text-xs ${status.color}`}>{status.label}</span>
                        </div>
                      );
                    })}
                    
                    {(!participantsData?.participants || participantsData.participants.length === 0) && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No participants yet. Share the link to invite others!
                      </p>
                    )}
                  </div>
                  
                  <div className="pt-2 border-t border-gray-100 text-xs text-gray-500">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Active now</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Today</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> This week</span>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-4">
        {puzzleData && (
          <Crossword 
            initialPuzzle={puzzleData}
            initialGrid={gridState || undefined}
            onCellChange={handleCellChange}
            onSave={handleSaveProgress}
            isCollaborative={data.session.isCollaborative}
            recentSessions={recentSessions}
            onSessionSelect={(sessionId) => navigate(`/session/${sessionId}`)}
          />
        )}
      </main>
    </div>
  );
}
