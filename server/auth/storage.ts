import { db } from "../db";
import { allowedEmails, users, type User } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import type { AuthenticatedUser, UserRole } from "./types";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName?: string | null;
  role?: UserRole;
}

export interface UpdateUserInput {
  firstName?: string | null;
  role?: UserRole;
  passwordHash?: string;
}

export interface AllowedEmailRecord {
  id: string;
  email: string;
  invitedBy: string | null;
  createdAt: Date | null;
}

class AuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, normalized));
    return user;
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const normalized = input.email.toLowerCase();
    const [created] = await db
      .insert(users)
      .values({
        email: normalized,
        passwordHash: input.passwordHash,
        firstName: input.firstName,
        role: input.role ?? "user",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return created;
  }

  async updateUser(id: string, data: UpdateUserInput): Promise<User | undefined> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.passwordHash !== undefined) updateData.passwordHash = data.passwordHash;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async listUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async ensureAllowedEmail(email: string, invitedBy?: string | null): Promise<void> {
    const normalized = email.toLowerCase();
    const existing = await this.isEmailAllowed(normalized);
    if (existing) return;
    await db.insert(allowedEmails).values({
      email: normalized,
      invitedBy: invitedBy ?? null,
    });
  }

  async removeAllowedEmail(id: string): Promise<void> {
    await db.delete(allowedEmails).where(eq(allowedEmails.id, id));
  }

  async updateAllowedEmail(id: string, data: { firstName?: string }): Promise<AllowedEmailRecord | undefined> {
    const updateData: Record<string, unknown> = {};

    if (data.firstName !== undefined) updateData.firstName = data.firstName;

    const [updated] = await db
      .update(allowedEmails)
      .set(updateData)
      .where(eq(allowedEmails.id, id))
      .returning();
    return updated;
  }

  async listAllowedEmails(): Promise<AllowedEmailRecord[]> {
    return db.select().from(allowedEmails);
  }

  async isEmailAllowed(email: string): Promise<AllowedEmailRecord | null> {
    const normalized = email.toLowerCase();
    const [record] = await db
      .select()
      .from(allowedEmails)
      .where(eq(allowedEmails.email, normalized));
    return record ?? null;
  }

  toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email ?? "",
      role: (user.role as UserRole) ?? "user",
      firstName: user.firstName ?? null,
    };
  }
}

export const authStorage = new AuthStorage();
