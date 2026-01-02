import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from 'http';

// These tests run against the actual server
// Ensure the database is set up before running
const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

describe('Authentication API', () => {
  let agent: request.Agent;

  beforeEach(() => {
    agent = request.agent(TEST_BASE_URL);
  });

  describe('POST /api/auth/login', () => {
    it('should reject invalid credentials', async () => {
      const response = await agent
        .post('/api/auth/login')
        .send({ email: 'invalid@example.com', password: 'wrongpassword' })
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message');
    });

    it('should accept valid credentials and return user', async () => {
      const response = await agent
        .post('/api/auth/login')
        .send({ 
          email: process.env.TEST_ADMIN_EMAIL || 'mark.clement@outlook.com', 
          password: process.env.TEST_ADMIN_PASSWORD || 'shadyx1970!' 
        })
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email');
      expect(response.body.email.toLowerCase()).toBe(
        (process.env.TEST_ADMIN_EMAIL || 'mark.clement@outlook.com').toLowerCase()
      );
    });

    it('should maintain session after login', async () => {
      // Login first
      const loginResponse = await agent
        .post('/api/auth/login')
        .send({ 
          email: process.env.TEST_ADMIN_EMAIL || 'mark.clement@outlook.com', 
          password: process.env.TEST_ADMIN_PASSWORD || 'shadyx1970!' 
        })
        .expect(200);

      // Check user endpoint (correct endpoint is /api/auth/me)
      const userResponse = await agent.get('/api/auth/me');
      expect(userResponse.status).toBe(200);
      expect(userResponse.body).toHaveProperty('id');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 for unauthenticated requests', async () => {
      // Use a fresh agent without cookies
      const freshAgent = request(TEST_BASE_URL);
      const response = await freshAgent.get('/api/auth/me');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and clear session', async () => {
      // Login first
      await agent
        .post('/api/auth/login')
        .send({ 
          email: process.env.TEST_ADMIN_EMAIL || 'mark.clement@outlook.com', 
          password: process.env.TEST_ADMIN_PASSWORD || 'shadyx1970!' 
        })
        .expect(200);

      // Logout
      const logoutResponse = await agent.post('/api/auth/logout');
      expect(logoutResponse.status).toBe(200);

      // Should now be unauthorized - use fresh agent to verify session is cleared
      const userResponse = await agent.get('/api/auth/me');
      expect(userResponse.status).toBe(401);
    });
  });
});
