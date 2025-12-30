import type { RequestHandler } from "express";

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated() && req.user?.role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Forbidden" });
};
