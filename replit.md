# Crossword Application (Historical notes)

> This document reflects an older Replit-based setup. The live stack now runs independently (local/Docker/Railway). Keep this file for historical reference only.

## Overview

A browser-based crossword solver with collaborative sessions, autosave, and mobile-friendly segmented clue input. Users solve puzzles from JSON, solo or with others, with real-time WebSocket sync and inline clue enumerations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 19 with TypeScript, using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, local React state for UI
- **Styling**: Tailwind CSS with shadcn/ui components
- **Clue UX**: Mobile segmented answer bar (word breaks from enumerations); desktop resizable clue panel; inline clue + enumeration formatting

### Backend Architecture
- **Runtime**: Node.js with Express (TypeScript, ESM)
- **API Pattern**: RESTful endpoints under `/api/*`
- **Real-time**: WebSocket server for collaborative puzzle solving
- **Build**: esbuild for server bundling, Vite for client

### Authentication
- Email/password with whitelist, Passport.js session-based auth (PostgreSQL-backed sessions). Replit Auth is no longer used.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts`
- **Key Tables**:
  - `users`, `allowed_emails`, `puzzles`, `puzzle_sessions`, `session_participants`, `puzzle_progress`

### Real-time Collaboration
- WebSocket connections per session; grid updates broadcast to all participants

### Key Design Decisions
1. Shared schema in `shared/` for types used by client/server
2. Puzzle JSON format stored under `puzzles/` and loaded into DB on startup
3. Autosave to DB with localStorage fallback for non-session mode
4. Session-based progress with collaborative sync via WebSocket

## External Dependencies

### Database
- PostgreSQL (required, connection via `DATABASE_URL` environment variable)
- Drizzle ORM for type-safe queries
- Schema migrations via `drizzle-kit push`

### Authentication Services
- Replit OpenID Connect provider (`ISSUER_URL` defaults to `https://replit.com/oidc`)
- Requires `REPL_ID` and `SESSION_SECRET` environment variables

### UI Components
- shadcn/ui with Radix UI primitives
- Lucide React for icons
- Full component library in `client/src/components/ui/`

### Development Tools
- Replit-specific Vite plugins for development experience
- Custom meta images plugin for OpenGraph tags