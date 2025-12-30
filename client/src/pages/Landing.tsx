import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BookOpen, Users, Puzzle, Brain, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Landing() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");

  const authMutation = useMutation({
    mutationFn: async () => {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload: Record<string, string> = { email, password };
      if (mode === "register") {
        payload.firstName = firstName;
      }
      const res = await apiRequest("POST", endpoint, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: mode === "login" ? "Welcome back" : "Account created",
        description: mode === "login" ? "Loading your sessions" : "You're signed in."
      });
      window.location.href = "/";
    },
    onError: (error: Error) => {
      toast({ title: "Unable to authenticate", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    authMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-amber-50 font-serif">
      <header className="border-b border-amber-200 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-amber-800" />
            <div>
              <h1 className="text-2xl font-bold text-amber-900">Shady Crosswords</h1>
              <p className="text-xs text-amber-700 italic">It's a family thing...</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant={mode === "login" ? "default" : "outline"}
              onClick={() => setMode("login")}
              className="bg-amber-700 hover:bg-amber-800"
            >
              Sign In
            </Button>
            <Button
              variant={mode === "register" ? "default" : "outline"}
              onClick={() => setMode("register")}
              className="bg-amber-700 hover:bg-amber-800"
            >
              Register
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 lg:py-20 flex flex-col gap-12 lg:flex-row lg:items-start">
        <section className="w-full lg:w-1/2 max-w-3xl mx-auto text-center space-y-6">
          <h2 className="text-5xl font-bold text-amber-900">Shady Crosswords</h2>
          <p className="text-2xl text-amber-700 italic">It's a family thing...</p>
          <div className="mb-8 flex justify-center">
            <img
              src="/crossword-hero.png"
              alt="Crossword puzzle"
              className="max-w-md w-full rounded-lg shadow-lg border-4 border-amber-200"
            />
          </div>
          <p className="text-xl text-amber-700 max-w-2xl mx-auto">
            Solve cryptic crosswords solo or collaborate with the family in real-time.
          </p>
          <div className="grid md:grid-cols-3 gap-6 mt-8 text-left">
            <FeatureCard icon={<Puzzle className="h-6 w-6 text-amber-800" />} title="Curated Puzzles" description="Guardian & Times crosswords ready to solve." />
            <FeatureCard icon={<Users className="h-6 w-6 text-amber-800" />} title="Solve Together" description="Live cursors, autosave, and invite-only rooms." />
            <FeatureCard icon={<Brain className="h-6 w-6 text-amber-800" />} title="Track Progress" description="Resume any board exactly where you left it." />
          </div>
        </section>

        <section className="w-full lg:w-2/5 max-w-md mx-auto bg-white border border-amber-200 rounded-xl shadow-lg p-6">
          <h3 className="text-2xl font-bold text-amber-900 mb-1">
            {mode === "login" ? "Sign in" : "Request an account"}
          </h3>
          <p className="text-sm text-amber-600 mb-6">
            {mode === "login"
              ? "Enter your details to continue."
              : "Registration is limited to invited family emails."}
          </p>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="first-name">Preferred Name</Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Mark"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-amber-700 hover:bg-amber-800"
              disabled={authMutation.isPending}
              data-testid="button-get-started"
            >
              {authMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "login" ? "Sign In" : "Register"}
            </Button>
          </form>
        </section>
      </main>

      <footer className="border-t border-amber-200 py-8 text-center text-amber-600">
        <p>Need access? Ask Mark to add your email.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white p-5 rounded-lg shadow-sm border border-amber-100 flex flex-col gap-3">
      <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h3 className="text-xl font-semibold text-amber-900 mb-1">{title}</h3>
        <p className="text-amber-700 text-sm">{description}</p>
      </div>
    </div>
  );
}
