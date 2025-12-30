export type UserRole = "admin" | "user";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  firstName: string | null;
}

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}
