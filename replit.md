# Cryptic Crossword Solver

## Overview

A browser-based cryptic crossword viewer and solver application. Users can upload puzzle JSON files, solve crosswords solo or collaboratively with others in real-time, and track their progress. The app features a classic newspaper-style design with modern multiplayer capabilities through WebSocket-based real-time collaboration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, local React state for UI
- **Styling**: Tailwind CSS v4 with shadcn/ui component library (New York style)
- **Fonts**: Playfair Display (serif for headings), Inter (UI), Roboto Mono (grid)

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful endpoints under `/api/*` prefix
- **Real-time**: WebSocket server for collaborative puzzle solving
- **Build**: esbuild for server bundling, Vite for client

### Authentication
- **Provider**: Replit Auth via OpenID Connect
- **Session Storage**: PostgreSQL-backed sessions using connect-pg-simple
- **Pattern**: Passport.js with OIDC strategy, session-based authentication

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` with models in `shared/models/`
- **Key Tables**:
  - `users` and `sessions` - Authentication (required for Replit Auth)
  - `puzzles` - Puzzle data storage (JSON blob)
  - `puzzle_sessions` - Solving sessions (solo or collaborative)
  - `session_participants` - Multi-user session access
  - `puzzle_progress` - Current grid state per session

### Real-time Collaboration
- WebSocket connections managed per session
- Grid updates broadcast to all participants in a session
- Connection tracking via `sessionConnections` Map

### Key Design Decisions
1. **Shared Schema**: Types defined once in `shared/` and imported by both client and server
2. **JSON Puzzle Format**: Puzzles stored as JSONB, schema defined in attached_assets
3. **Local Storage Fallback**: Client-side puzzle library for offline puzzle access
4. **Session-based Progress**: Each solving session has independent progress state

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