import type { Express } from "express";
import passport from "passport";
import { setupSession } from "./session";
import { setupPassport } from "./localStrategy";
import { ensureDefaultAdmin } from "./seedDefaultAdmin";

export async function setupAuth(app: Express) {
  setupSession(app);
  setupPassport();
  app.use(passport.initialize());
  app.use(passport.session());
  await ensureDefaultAdmin();
}

export { registerAuthRoutes } from "./routes";
export { isAuthenticated, requireAdmin } from "./guards";
export { authStorage } from "./storage";
