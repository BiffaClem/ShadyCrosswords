# AI Coding Assistant Instructions for Crossword Application

## Project Overview
This is a collaborative crossword puzzle web application built with React 19, Express.js, and PostgreSQL. It features real-time multiplayer solving, user authentication, and an admin panel for puzzle and user management.

## Architecture
- **Frontend**: React 19 + TypeScript, shadcn/ui components, Tailwind CSS, TanStack Query for API state management, Wouter for routing
- **Backend**: Express.js + TypeScript, Passport.js authentication, WebSocket server for real-time collaboration
- **Database**: PostgreSQL with Drizzle ORM, schema defined in `shared/schema.ts`
- **Build System**: Vite for frontend, esbuild for backend bundling
- **Testing**: Vitest for unit/API tests, Playwright for E2E tests
- **Deployment**: Docker containerization, Railway.app hosting

## Key Components & Data Flow
- **Puzzles**: Stored as JSON files in `puzzles/` directory, loaded into DB on startup
- **Sessions**: Represent solving instances (solo or collaborative), track progress and participants
- **Real-time**: WebSocket connections (`/ws`) broadcast cell updates and session events
- **Authentication**: Email/password with whitelisted registration, session-based auth
- **Progress**: Autosaved to DB with debouncing (1s), also cached in localStorage

## Development Workflows
- **Local Development**: `npm run dev` (backend) + `npm run dev:client` (frontend on :5000)
- **Database**: `npm run db:push` applies schema changes via Drizzle migrations
- **Testing**: `npm run test:all` runs API + E2E tests; E2E uses Playwright with Chromium + mobile Chrome
- **Build**: `npm run build` creates production bundle in `dist/`
- **Environment**: Use `.env` with `DB_TARGET` (local/docker/railway) to select database URL

## Code Patterns & Conventions
- **Imports**: Use `@/` for client src, `@shared/` for shared types, absolute paths preferred
- **API Routes**: Custom logging middleware captures API calls with response JSON; error handling returns `{ message }` with appropriate status codes
- **Components**: shadcn/ui pattern - export component + props interface; use `cn()` utility for conditional classes
- **Database**: Use Drizzle relations and insert schemas; queries in `server/storage.ts`
- **WebSocket Events**: `join_session`, `cell_update`, `progress_update`, `session_submitted`
- **Mobile Handling**: Touch events for clue input, zoom controls, resizable panels
- **Error Checking**: Crossword validation compares user input against clue answers from puzzle data
- **File Structure**: `client/src/` for frontend, `server/` for backend, `shared/` for types/schema

## Common Tasks
- **Add API Endpoint**: Create route in `server/routes.ts`, add storage method in `server/storage.ts`, define types in `shared/schema.ts`
- **New UI Component**: Use shadcn/ui pattern, place in `client/src/components/ui/`, export from `client/src/components/index.ts`
- **Database Migration**: Modify schema in `shared/schema.ts`, run `npm run db:push`
- **Real-time Feature**: Add WebSocket event handlers in `server/routes.ts` and client-side listeners
- **Test Addition**: API tests in `tests/api/`, E2E in `tests/e2e/`, use existing patterns for setup/teardown

## Important Files
- `server/index.ts`: Express app setup, middleware, Vite integration
- `server/routes.ts`: All API endpoints, WebSocket handling
- `client/src/App.tsx`: Main router with auth guards
- `client/src/components/Crossword.tsx`: Core puzzle interface with real-time sync
- `shared/schema.ts`: Database schema and relations
- `package.json`: Scripts and dependencies
- `drizzle.config.js`: Database configuration with environment switching