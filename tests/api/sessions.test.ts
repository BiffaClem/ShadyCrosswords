import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

describe('Session API', () => {
  let agent: request.Agent;
  let createdSessionId: string | null = null;

  beforeEach(async () => {
    agent = request.agent(TEST_BASE_URL);
    // Login before each test
    await agent
      .post('/api/auth/login')
      .send({
        email: process.env.TEST_ADMIN_EMAIL || 'mark.clement@outlook.com',
        password: process.env.TEST_ADMIN_PASSWORD || 'shadyx1970!',
      });
  });

  afterEach(async () => {
    // Cleanup: delete session if created
    if (createdSessionId) {
      await agent.delete(`/api/sessions/${createdSessionId}`);
      createdSessionId = null;
    }
  });

  describe('GET /api/puzzles', () => {
    it('should return list of puzzles', async () => {
      const response = await agent.get('/api/puzzles');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      // Each puzzle should have required fields
      const puzzle = response.body[0];
      expect(puzzle).toHaveProperty('id');
      expect(puzzle).toHaveProperty('puzzleId');
      expect(puzzle).toHaveProperty('title');
      expect(puzzle).toHaveProperty('data');
    });

    it('should require authentication', async () => {
      const unauthResponse = await request(TEST_BASE_URL).get('/api/puzzles');
      expect(unauthResponse.status).toBe(401);
    });
  });

  describe('POST /api/sessions', () => {
    it('should create a new session for a puzzle', async () => {
      // First get a puzzle
      const puzzlesResponse = await agent.get('/api/puzzles');
      const puzzle = puzzlesResponse.body[0];

      // Create session
      const response = await agent
        .post('/api/sessions')
        .send({
          puzzleId: puzzle.id,
          name: 'Test Session',
          isCollaborative: true,
          difficulty: 'standard',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('puzzleId', puzzle.id);
      expect(response.body).toHaveProperty('isCollaborative', true);

      createdSessionId = response.body.id;
    });

    it('should reject invalid puzzle ID', async () => {
      const response = await agent
        .post('/api/sessions')
        .send({
          puzzleId: 'nonexistent-puzzle-id',
          name: 'Test Session',
        });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should return session with puzzle and progress data', async () => {
      // Create a session first
      const puzzlesResponse = await agent.get('/api/puzzles');
      const puzzle = puzzlesResponse.body[0];

      const createResponse = await agent
        .post('/api/sessions')
        .send({
          puzzleId: puzzle.id,
          name: 'Test Session for Get',
          isCollaborative: true,
        });

      createdSessionId = createResponse.body.id;

      // Get the session
      const response = await agent.get(`/api/sessions/${createdSessionId}`);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('session');
      expect(response.body).toHaveProperty('puzzle');
      expect(response.body).toHaveProperty('progress');
      expect(response.body).toHaveProperty('participants');

      // Session should have correct data
      expect(response.body.session.id).toBe(createdSessionId);
      expect(response.body.puzzle.id).toBe(puzzle.id);

      // Progress should have a grid initialized
      expect(response.body.progress).toHaveProperty('grid');
      expect(Array.isArray(response.body.progress.grid)).toBe(true);
    });

    it('should return 404 for nonexistent session', async () => {
      const response = await agent.get('/api/sessions/nonexistent-session-id');
      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/sessions/:id/progress', () => {
    it('should save and persist progress', async () => {
      // Create a session
      const puzzlesResponse = await agent.get('/api/puzzles');
      const puzzle = puzzlesResponse.body[0];
      const gridSize = puzzle.data.size;

      const createResponse = await agent
        .post('/api/sessions')
        .send({
          puzzleId: puzzle.id,
          name: 'Test Session for Progress',
          isCollaborative: true,
        });

      createdSessionId = createResponse.body.id;

      // Create a grid with some values
      const testGrid = Array(gridSize.rows)
        .fill(null)
        .map(() => Array(gridSize.cols).fill(''));
      testGrid[0][0] = 'A';
      testGrid[0][1] = 'B';
      testGrid[0][2] = 'C';

      // Save progress
      const saveResponse = await agent
        .post(`/api/sessions/${createdSessionId}/progress`)
        .send({ grid: testGrid });

      expect(saveResponse.status).toBe(200);

      // Retrieve session and verify progress persisted
      const getResponse = await agent.get(`/api/sessions/${createdSessionId}`);
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.progress.grid[0][0]).toBe('A');
      expect(getResponse.body.progress.grid[0][1]).toBe('B');
      expect(getResponse.body.progress.grid[0][2]).toBe('C');
    });

    it('should not lose progress on subsequent requests', async () => {
      // Create a session
      const puzzlesResponse = await agent.get('/api/puzzles');
      const puzzle = puzzlesResponse.body[0];
      const gridSize = puzzle.data.size;

      const createResponse = await agent
        .post('/api/sessions')
        .send({
          puzzleId: puzzle.id,
          name: 'Test Session for Progress Persistence',
          isCollaborative: true,
        });

      createdSessionId = createResponse.body.id;

      // Create initial grid
      const testGrid = Array(gridSize.rows)
        .fill(null)
        .map(() => Array(gridSize.cols).fill(''));
      testGrid[0][0] = 'X';
      testGrid[1][1] = 'Y';

      // Save initial progress
      await agent
        .post(`/api/sessions/${createdSessionId}/progress`)
        .send({ grid: testGrid });

      // Make multiple GET requests (simulating page refresh)
      for (let i = 0; i < 3; i++) {
        const response = await agent.get(`/api/sessions/${createdSessionId}`);
        expect(response.status).toBe(200);
        expect(response.body.progress.grid[0][0]).toBe('X');
        expect(response.body.progress.grid[1][1]).toBe('Y');
      }

      // Update progress
      testGrid[2][2] = 'Z';
      await agent
        .post(`/api/sessions/${createdSessionId}/progress`)
        .send({ grid: testGrid });

      // Verify all values persist
      const finalResponse = await agent.get(`/api/sessions/${createdSessionId}`);
      expect(finalResponse.body.progress.grid[0][0]).toBe('X');
      expect(finalResponse.body.progress.grid[1][1]).toBe('Y');
      expect(finalResponse.body.progress.grid[2][2]).toBe('Z');
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('should delete owned session', async () => {
      // Create a session
      const puzzlesResponse = await agent.get('/api/puzzles');
      const puzzle = puzzlesResponse.body[0];

      const createResponse = await agent
        .post('/api/sessions')
        .send({
          puzzleId: puzzle.id,
          name: 'Test Session to Delete',
        });

      const sessionId = createResponse.body.id;

      // Delete the session
      const deleteResponse = await agent.delete(`/api/sessions/${sessionId}`);
      expect(deleteResponse.status).toBe(200);

      // Verify it's gone
      const getResponse = await agent.get(`/api/sessions/${sessionId}`);
      expect(getResponse.status).toBe(404);

      // Don't try to delete in cleanup since it's already deleted
      createdSessionId = null;
    });
  });
});
