import type { Express } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import { authStorage } from "./storage";
import { isAuthenticated } from "./guards";

function validateEmail(email?: string): string | null {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) return null;
  return trimmed;
}

function validatePassword(password?: string): string | null {
  if (!password || typeof password !== "string") return null;
  if (password.length < 8) return null;
  return password;
}

export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/me", isAuthenticated, (req, res) => {
    res.json(req.user);
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message ?? "Invalid credentials" });
      }
      req.logIn(user, (loginError) => {
        if (loginError) return next(loginError);
        return res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const email = validateEmail(req.body?.email);
      const password = validatePassword(req.body?.password);
      const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : null;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const allowed = await authStorage.isEmailAllowed(email);
      if (!allowed) {
        return res.status(403).json({ message: "Registration is restricted to invited users" });
      }

      const existingUser = await authStorage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "Account already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const created = await authStorage.createUser({
        email,
        passwordHash,
        firstName,
        role: "user",
      });
      const authUser = authStorage.toAuthenticatedUser(created);

      req.logIn(authUser, (loginError) => {
        if (loginError) return next(loginError);
        return res.status(201).json(authUser);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", isAuthenticated, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session?.destroy(() => {
        res.json({ message: "Logged out" });
      });
    });
  });

  app.post("/api/auth/change-password", isAuthenticated, async (req, res, next) => {
    try {
      const currentPassword = req.body?.currentPassword;
      const newPassword = validatePassword(req.body?.newPassword);

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      const user = await authStorage.getUser(req.user!.id);
      if (!user || !user.passwordHash) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      await authStorage.updateUser(req.user!.id, { passwordHash: newPasswordHash });

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      next(error);
    }
  });
}
