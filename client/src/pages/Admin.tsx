import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError, redirectToLogin } from "@/lib/auth-utils";
import {
  ShieldCheck,
  MailPlus,
  UserCog,
  Trash2,
  ArrowLeft,
  RefreshCcw,
  CheckCircle2,
  Activity,
  Loader2,
  Key,
} from "lucide-react";

interface AllowedEmail {
  id: string;
  email: string;
  invitedBy: string | null;
  createdAt: string | null;
}

interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  role: "admin" | "user";
  createdAt?: string | null;
}

interface AdminSession {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string | null;
  puzzleId: string;
  puzzleTitle?: string | null;
  puzzleExternalId?: string | null;
  percentComplete: number;
  submittedAt: string | null;
  createdAt?: string | null;
}

interface Person {
  id: string;
  email: string;
  firstName: string | null;
  role: "admin" | "user" | "invited";
  createdAt: string | null;
  invitedAt: string | null;
  registeredAt: string | null;
  isRegistered: boolean;
  invitedBy: string | null;
}

type UserDeleteMeta = {
  id: string;
  email: string;
};

type SessionDeleteMeta = {
  id: string;
  name: string;
};

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const asNumber = Number(value);
  const date = Number.isFinite(asNumber) && asNumber > 0 ? new Date(asNumber) : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Admin() {
  const { user, logout, isLoggingOut } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newInviteFirstName, setNewInviteFirstName] = useState("");
  const [newInvitePassword, setNewInvitePassword] = useState("Shady0ks");
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sessionToDelete, setSessionToDelete] = useState<SessionDeleteMeta | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserDeleteMeta | null>(null);
  const [userToSetPassword, setUserToSetPassword] = useState<{ id: string; email: string } | null>(null);
  const [setPasswordValue, setSetPasswordValue] = useState("Shady0ks");

  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate("/");
    }
  }, [user, navigate]);

  const handleApiError = (error: unknown, fallback: string) => {
    if (error instanceof Error) {
      if (isUnauthorizedError(error)) {
        redirectToLogin(toast);
        return;
      }
      toast({ title: fallback, description: error.message, variant: "destructive" });
    }
  };

  const { data: allowedEmails, isLoading: isLoadingAllowed, error: allowedEmailsError } = useQuery<AllowedEmail[]>({
    queryKey: ["/api/admin/allowed-emails"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/allowed-emails");
      return res.json();
    },
  });

  useEffect(() => {
    if (allowedEmailsError) {
      handleApiError(allowedEmailsError, "Unable to load allowed emails");
    }
  }, [allowedEmailsError]);

  const { data: users, isLoading: isLoadingUsers, error: usersError } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      return res.json();
    },
  });

  useEffect(() => {
    if (usersError) {
      handleApiError(usersError, "Unable to load users");
    }
  }, [usersError]);

  const { data: people, isLoading: isLoadingPeople, error: peopleError } = useQuery<Person[]>({
    queryKey: ["/api/admin/people"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/people");
      return res.json();
    },
  });

  useEffect(() => {
    if (peopleError) {
      handleApiError(peopleError, "Unable to load people");
    }
  }, [peopleError]);

  const { data: sessions, isLoading: isLoadingSessions, error: sessionsError } = useQuery<AdminSession[]>({
    queryKey: ["/api/admin/sessions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/sessions");
      return res.json();
    },
  });

  useEffect(() => {
    if (sessionsError) {
      handleApiError(sessionsError, "Unable to load sessions");
    }
  }, [sessionsError]);

  const { data: buildInfo } = useQuery<{ timestamp: string; date: string; time: string }>({
    queryKey: ["/api/build-info"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/build-info");
      return res.json();
    },
  });

  const userMap = useMemo(() => {
    if (!users) return new Map<string, AdminUser>();
    return new Map(users.map((u) => [u.id, u]));
  }, [users]);

  const peopleMap = useMemo(() => {
    if (!people) return new Map<string, Person>();
    return new Map(people.map((p) => [p.id, p]));
  }, [people]);

  const allowedEmailMutation = useMutation<AllowedEmail[], Error, { email: string; firstName: string | null; password: string }>({
    mutationFn: async ({ email, firstName, password }) => {
      const res = await apiRequest("POST", "/api/admin/allowed-emails", { email, firstName, password });
      return res.json();
    },
    onSuccess: (updated: AllowedEmail[], { email }) => {
      queryClient.setQueryData(["/api/admin/allowed-emails"], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people"] });
      toast({ title: "User created", description: `${email} can now log in with the provided credentials.` });
      setNewInviteEmail("");
      setNewInviteFirstName("");
      setNewInvitePassword("Shady0ks");
    },
    onError: (error) => handleApiError(error, "Unable to create user"),
  });

  const removeAllowedMutation = useMutation<AllowedEmail[], Error, string>({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/allowed-emails/${id}`);
      return res.json();
    },
    onSuccess: (updated: AllowedEmail[]) => {
      queryClient.setQueryData(["/api/admin/allowed-emails"], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people"] });
      toast({ title: "Invite removed" });
    },
    onError: (error) => handleApiError(error, "Unable to remove invite"),
  });

  const updatePersonMutation = useMutation<Person, Error, { id: string; role?: "admin" | "user"; firstName?: string }>({
    mutationFn: async ({ id, role, firstName }) => {
      const payload: Record<string, string> = {};
      if (role) payload.role = role;
      if (firstName !== undefined) payload.firstName = firstName;
      const res = await apiRequest("PATCH", `/api/admin/people/${id}`, payload);
      return res.json();
    },
    onSuccess: (updatedPerson: Person) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated", description: updatedPerson.email });
    },
    onError: (error) => handleApiError(error, "Unable to update user"),
  });

  const deleteUserMutation = useMutation<void, Error, string>({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/people"] });
      toast({ title: "User deleted" });
      setUserToDelete(null);
    },
    onError: (error) => handleApiError(error, "Unable to delete user"),
  });

  const deleteSessionMutation = useMutation<void, Error, string>({
    mutationFn: async (sessionId: string) => {
      await apiRequest("DELETE", `/api/sessions/${sessionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sessions"] });
      toast({ title: "Session removed" });
      setSessionToDelete(null);
    },
    onError: (error) => handleApiError(error, "Unable to delete session"),
  });

  const changePasswordMutation = useMutation<void, Error, { currentPassword: string; newPassword: string }>({
    mutationFn: async ({ currentPassword, newPassword }) => {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully" });
      setShowPasswordChange(false);
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (error) => handleApiError(error, "Unable to change password"),
  });

  const setUserPasswordMutation = useMutation<void, Error, { allowedEmailId: string; email: string; password: string }>({
    mutationFn: async ({ allowedEmailId, password }) => {
      // First find the user by allowed email ID
      const allowedEmails = await queryClient.fetchQuery({
        queryKey: ["/api/admin/allowed-emails"],
        queryFn: async () => {
          const res = await apiRequest("GET", "/api/admin/allowed-emails");
          return res.json();
        },
      });
      
      const allowedEmail = allowedEmails.find((a: any) => a.id === allowedEmailId);
      if (!allowedEmail) {
        throw new Error("Allowed email not found");
      }
      
      const users = await queryClient.fetchQuery({
        queryKey: ["/api/admin/users"],
        queryFn: async () => {
          const res = await apiRequest("GET", "/api/admin/users");
          return res.json();
        },
      });
      
      const user = users.find((u: any) => u.email.toLowerCase() === allowedEmail.email.toLowerCase());
      if (!user) {
        throw new Error("User not found");
      }
      
      await apiRequest("POST", `/api/admin/users/${user.id}/password`, { password });
    },
    onSuccess: () => {
      toast({ title: "Password set successfully" });
      setUserToSetPassword(null);
      setSetPasswordValue("Shady0ks");
    },
    onError: (error) => handleApiError(error, "Unable to set password"),
  });

  const totalPeople = people?.length ?? 0;
  const registeredUsers = people?.filter((p) => p.isRegistered).length ?? 0;
  const pendingInvites = people?.filter((p) => !p.isRegistered).length ?? 0;
  const adminUsers = people?.filter((p) => p.isRegistered && p.role === "admin").length ?? 0;

  const activeSessions = sessions?.filter((s) => !s.submittedAt).length ?? 0;
  const completedSessions = sessions?.filter((s) => s.submittedAt).length ?? 0;

  const handleSetPassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (!setPasswordValue.trim() || !userToSetPassword) return;
    if (setPasswordValue.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters long.", variant: "destructive" });
      return;
    }
    setUserPasswordMutation.mutate({ 
      allowedEmailId: userToSetPassword.id, 
      email: userToSetPassword.email,
      password: setPasswordValue.trim() 
    });
  };

  const handlePasswordChange = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword.trim() || !newPassword.trim()) return;
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters long.", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ currentPassword: currentPassword.trim(), newPassword: newPassword.trim() });
  };

  const isDefaultPassword = (email: string) => {
    // Default password detection removed for security reasons
    return false;
  };

  const handleRoleChange = (personId: string, nextRole: "admin" | "user") => {
    updatePersonMutation.mutate({ id: personId, role: nextRole });
  };

  const handleNameBlur = (person: Person, originalName: string | null, value: string) => {
    if (value.trim() === (originalName ?? "")) return;
    updatePersonMutation.mutate({ id: person.id, firstName: value.trim() });
  };

  const handleAddInvite = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newInviteEmail.trim()) return;
    allowedEmailMutation.mutate({
      email: newInviteEmail.trim(),
      firstName: newInviteFirstName.trim() || null,
      password: newInvitePassword.trim() || "Shady0ks"
    });
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 text-amber-800">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking access...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-stone-50 to-white font-serif">
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-amber-800" />
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-500">Admin Console</p>
              <h1 className="text-2xl font-bold text-amber-900">Shady Crosswords HQ</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="text-amber-700" onClick={() => navigate("/")}> 
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to puzzles
            </Button>
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700"
              onClick={() => setShowPasswordChange(true)}
            >
              Change password
            </Button>
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700"
              onClick={() => logout()}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? "Signing out" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <section className="grid gap-4 md:grid-cols-5">
          <Card className="border-amber-200 bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="uppercase text-xs tracking-wide text-amber-500">Total People</CardDescription>
              <CardTitle className="text-3xl text-amber-900">{totalPeople}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-amber-700">
              <MailPlus className="h-4 w-4" />
              {registeredUsers} registered, {pendingInvites} invited
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="uppercase text-xs tracking-wide text-amber-500">Admins</CardDescription>
              <CardTitle className="text-3xl text-amber-900">{adminUsers}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-amber-700">
              <UserCog className="h-4 w-4" />
              People who can break things
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="uppercase text-xs tracking-wide text-amber-500">Active Boards</CardDescription>
              <CardTitle className="text-3xl text-amber-900">{activeSessions}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-amber-700">
              <Activity className="h-4 w-4" />
              Still in play
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="uppercase text-xs tracking-wide text-amber-500">Submitted</CardDescription>
              <CardTitle className="text-3xl text-amber-900">{completedSessions}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-amber-700">
              <CheckCircle2 className="h-4 w-4" />
              Locked & archived
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="uppercase text-xs tracking-wide text-amber-500">Build Date</CardDescription>
              <CardTitle className="text-lg text-amber-900">{buildInfo?.date || "Loading..."}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-amber-700">
              <RefreshCcw className="h-4 w-4" />
              {buildInfo?.time || "Loading..."}
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-amber-200 bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-amber-900">People Management</CardTitle>
                  <CardDescription>Manage invites and registered users in one place.</CardDescription>
                </div>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700 border">{totalPeople} people</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleAddInvite} className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="invite-name">Name (optional)</Label>
                  <Input
                    id="invite-name"
                    type="text"
                    placeholder="John"
                    value={newInviteFirstName}
                    onChange={(event) => setNewInviteFirstName(event.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="invite-email">Email address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    required
                    placeholder="family@example.com"
                    value={newInviteEmail}
                    onChange={(event) => setNewInviteEmail(event.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="invite-password">Password</Label>
                  <Input
                    id="invite-password"
                    type="text"
                    placeholder="Shady0ks"
                    value={newInvitePassword}
                    onChange={(event) => setNewInvitePassword(event.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    className="bg-amber-700 hover:bg-amber-800 w-full"
                    disabled={allowedEmailMutation.isPending}
                  >
                    {allowedEmailMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Create user
                  </Button>
                </div>
              </form>
              <Separator />
              <div className="max-h-96 overflow-auto rounded-lg border border-amber-100">
                {isLoadingPeople ? (
                  <div className="flex items-center justify-center p-6 text-amber-600">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading people
                  </div>
                ) : people && people.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {people.map((person) => (
                        <TableRow key={person.id}>
                          <TableCell className="min-w-[160px]">
                            <Input
                              defaultValue={person.firstName ?? ""}
                              placeholder="Preferred name"
                              onBlur={(event) => handleNameBlur(person, person.firstName, event.target.value)}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-amber-900">{person.email}</TableCell>
                          <TableCell className="min-w-[140px]">
                            {person.isRegistered ? (
                              <Select value={person.role} onValueChange={(value) => handleRoleChange(person.id, value as "admin" | "user")}> 
                                <SelectTrigger>
                                  <SelectValue placeholder="Role" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="user">Solver</SelectItem>
                                  <SelectItem value="admin">Admin</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline" className="text-amber-600 border-amber-300">Invited</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {person.isRegistered ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border border-emerald-200">Registered</Badge>
                                {isDefaultPassword(person.email) && (
                                  <Badge variant="secondary" className="bg-red-100 text-red-700 border border-red-200 text-xs">
                                    Default password
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-700 border border-amber-200">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-amber-600">
                            {person.isRegistered ? formatDate(person.registeredAt) : formatDate(person.invitedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {person.isRegistered && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-blue-500 hover:text-blue-700"
                                  onClick={() => setUserToSetPassword({ id: person.id, email: person.email })}
                                  title="Set password"
                                >
                                  <Key className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-500"
                                onClick={() => {
                                  if (person.isRegistered) {
                                    setUserToDelete({ id: person.id, email: person.email });
                                  } else {
                                    removeAllowedMutation.mutate(person.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-6 text-center text-amber-500">No people yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-amber-200 bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl text-amber-900">Sessions Oversight</CardTitle>
                  <CardDescription>Monitor every crossword on file.</CardDescription>
                </div>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {sessions?.length ?? 0} tracked
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {isLoadingSessions ? (
                <div className="flex items-center justify-center p-6 text-amber-600">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading sessions
                </div>
              ) : sessions && sessions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Puzzle</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead className="text-right">Controls</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div className="font-medium text-amber-900">{session.name}</div>
                          <p className="text-xs text-amber-600">{session.puzzleTitle ?? "Unknown puzzle"}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-amber-900">{session.ownerName ?? "Unknown"}</p>
                          <p className="text-xs text-amber-600">{formatDate(session.createdAt)}</p>
                        </TableCell>
                        <TableCell>
                          {session.submittedAt ? (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border border-emerald-200">Submitted</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border border-amber-200">In progress</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 bg-amber-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${session.submittedAt ? "bg-emerald-600" : "bg-amber-600"}`}
                                style={{ width: `${session.percentComplete}%` }}
                              />
                            </div>
                            <span className="text-sm text-amber-700">{session.percentComplete}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500"
                            onClick={() => setSessionToDelete({ id: session.id, name: session.name })}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-6 text-center text-amber-500">No sessions recorded.</div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Password Change Dialog */}
      <AlertDialog open={showPasswordChange} onOpenChange={setShowPasswordChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Password</AlertDialogTitle>
            <AlertDialogDescription>
              Enter your current password and choose a new secure password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={handlePasswordChange}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <p className="text-sm text-amber-600">Password must be at least 8 characters long.</p>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Change Password
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {sessionToDelete?.name}. Any grid progress will disappear.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => sessionToDelete && deleteSessionMutation.mutate(sessionToDelete.id)}
            >
              {deleteSessionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!userToSetPassword} onOpenChange={(open) => !open && setUserToSetPassword(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set Password</AlertDialogTitle>
            <AlertDialogDescription>
              Set a new password for {userToSetPassword?.email}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form onSubmit={handleSetPassword}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="set-password">New Password</Label>
                <Input
                  id="set-password"
                  type="text"
                  required
                  minLength={8}
                  value={setPasswordValue}
                  onChange={(e) => setSetPasswordValue(e.target.value)}
                  placeholder="Shady0ks"
                />
                <p className="text-sm text-amber-600">Password must be at least 8 characters long.</p>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={setUserPasswordMutation.isPending}
              >
                {setUserPasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Set Password
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
