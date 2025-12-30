import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { authStorage } from "./storage";

export function setupPassport() {
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const user = await authStorage.getUserByEmail(email);
        if (!user || !user.passwordHash) {
          return done(null, false, { message: "Invalid email or password" });
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return done(null, false, { message: "Invalid email or password" });
        }

        return done(null, authStorage.toAuthenticatedUser(user));
      } catch (error) {
        return done(error as Error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await authStorage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      return done(null, authStorage.toAuthenticatedUser(user));
    } catch (error) {
      return done(error as Error);
    }
  });
}
