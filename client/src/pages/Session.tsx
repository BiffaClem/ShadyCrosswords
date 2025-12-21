import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Crossword from "@/components/Crossword";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Users, Copy, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";

interface SessionData {
  session: any;
  puzzle: any;
  progress: any;
  participants: any[];
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

  const { data, isLoading, error } = useQuery<SessionData>({
    queryKey: ["/api/sessions", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sessions/${id}`);
      return res.json();
    },
    retry: false,
  });

  // Initialize grid from server progress
  useEffect(() => {
    if (data?.progress?.grid) {
      setGridState(data.progress.grid);
    }
  }, [data?.progress?.grid]);

  // WebSocket connection for real-time collaboration
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
  }, [data?.session?.isCollaborative, user, id]);

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
    
    // Broadcast via WebSocket for collaborative sessions
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
          
          <div className="flex items-center gap-4">
            {data.session.isCollaborative && (
              <>
                <div className="flex items-center gap-2 text-amber-700">
                  <Users className="h-4 w-4" />
                  <span data-testid="text-active-users">{activeUsers.length + 1} online</span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={copyInviteLink}
                  className="border-amber-300"
                  data-testid="button-copy-link"
                >
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? "Copied!" : "Invite"}
                </Button>
              </>
            )}
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
          />
        )}
      </main>
    </div>
  );
}
