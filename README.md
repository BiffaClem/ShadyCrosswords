# Crossword Application

A web-based crossword puzzle application built with React, Express, and SQLite. Features user authentication, admin management, real-time puzzle solving, and collaborative sessions.

## System Architecture

### Frontend
- **React 19** with TypeScript for the user interface
- **shadcn/ui** components with Tailwind CSS for styling
- **TanStack Query** for API state management and caching
- **Wouter** for client-side routing
- **WebSocket** connections for real-time puzzle collaboration

### Backend
- **Express.js** server with TypeScript
- **Passport.js** for local authentication
- **SQLite** database with **Drizzle ORM** for data persistence
- **WebSocket Server** for real-time updates during puzzle sessions
- RESTful API for user management, puzzle operations, and admin functions

### Database Schema
- `users`: User accounts with authentication details
- `allowed_emails`: Whitelist for user registration
- `puzzles`: Crossword puzzle data loaded from JSON files
- `sessions`: Active puzzle-solving sessions with user progress

### Deployment
- **Docker** containerization for consistent deployment
- **Node.js 20** runtime environment
- Production builds optimized with esbuild

## Local Development

### Prerequisites
- Node.js 20 or later
- npm or yarn package manager

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd crossword
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment configuration**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your local configuration. At minimum, update:
   - `SESSION_SECRET` (use a random string)
   - `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD`

4. **Database setup**
   ```bash
   npm run db:push
   ```
   This creates the SQLite database and runs migrations.

5. **Load puzzle data**
   The application automatically loads crossword puzzles from the `puzzles/` directory on startup. Ensure your puzzle JSON files are in the correct format.

6. **Start development servers**

   **Option A: Separate client and server (recommended for development)**
   ```bash
   # Terminal 1: Start the backend server
   npm run dev

   # Terminal 2: Start the frontend development server
   npm run dev:client
   ```
   The application will be available at `http://localhost:5000`

   **Option B: Using Docker (closer to production)**
   ```bash
   docker-compose up --build
   ```

### Development Scripts
- `npm run dev:client` - Start Vite development server for frontend
- `npm run dev` - Start Express development server
- `npm run build` - Build production bundle
- `npm run check` - Run TypeScript type checking
- `npm run db:push` - Push database schema changes

## Preparing for Hosting

### Environment Variables
Ensure your `.env` file contains production-appropriate values:

```env
PORT=5000
DATABASE_URL=sqlite:/app/data/crossword.sqlite
SESSION_SECRET=<strong-random-secret>
SESSION_COOKIE_SECURE=true  # Set to true for HTTPS
DEFAULT_ADMIN_EMAIL=<your-admin-email>
DEFAULT_ADMIN_PASSWORD=<secure-password>
DEFAULT_ADMIN_NAME=<admin-name>
DATA_DIR=/app/data
```

### Build Process
1. **Build the application**
   ```bash
   npm run build
   ```

2. **Test the production build**
   ```bash
   npm start
   ```

3. **Verify Docker build**
   ```bash
   docker build -t crossword-app .
   docker run -p 5000:5000 --env-file .env crossword-app
   ```

### Data Persistence
- Puzzle data is loaded from `puzzles/` directory
- User data and sessions are stored in SQLite database
- Use Docker volumes for data persistence in production

## Hosting on Railway.app

Railway.app provides easy Docker-based deployment with automatic scaling and database hosting.

### Prerequisites
- Railway.app account
- GitHub repository connected to Railway

### Deployment Steps

1. **Connect your repository**
   - Go to [Railway.app](https://railway.app) and sign in
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your crossword application repository

2. **Configure environment variables**
   - In your Railway project dashboard, go to "Variables"
   - Add the following environment variables:
     ```
     PORT=5000
     DATABASE_URL=sqlite:/app/data/crossword.sqlite
     SESSION_SECRET=<generate-a-secure-random-string>
     SESSION_COOKIE_SECURE=true
     DEFAULT_ADMIN_EMAIL=<your-admin-email>
     DEFAULT_ADMIN_PASSWORD=<secure-password>
     DEFAULT_ADMIN_NAME=<your-admin-name>
     DATA_DIR=/app/data
     ```

3. **Configure build settings** (if needed)
   - Railway automatically detects Docker projects
   - The `Dockerfile` and `docker-compose.yml` will be used for deployment

4. **Deploy**
   - Railway will automatically build and deploy when you push to your main branch
   - Monitor the deployment in the Railway dashboard

5. **Access your application**
   - Once deployed, Railway provides a public URL for your application
   - The admin panel will be available at `/admin` on your domain

### Railway-specific Notes
- Railway provides persistent volumes automatically for the `/app/data` directory
- The application uses Railway's built-in networking (no need to configure ports manually)
- Monitor logs and metrics through the Railway dashboard
- Scale your application as needed through the Railway interface

## How the System Works

### User Flow
1. **Registration/Login**: Users register with email/password or login with existing credentials
2. **Puzzle Selection**: Browse available crossword puzzles
3. **Solving**: Interactive crossword interface with real-time validation
4. **Collaboration**: Multiple users can join the same puzzle session via WebSocket
5. **Progress Tracking**: User progress is saved automatically

### Admin Features
- **User Management**: View, add, edit, and remove users
- **Email Whitelist**: Control who can register for accounts
- **Puzzle Management**: Upload and manage crossword puzzles
- **Session Monitoring**: View active puzzle sessions

### Real-time Collaboration
- WebSocket connections enable live updates when users join/leave sessions
- Changes are synchronized across all participants in real-time
- Session state is persisted to prevent data loss

### Data Management
- **Puzzles**: Stored as JSON files in the `puzzles/` directory, loaded into database on startup
- **User Data**: SQLite database with user accounts, sessions, and progress
- **Sessions**: Temporary WebSocket-based sessions for collaborative solving

### Security
- Password hashing with bcrypt
- Session-based authentication
- Admin-only routes protected with middleware
- Email whitelisting for user registration control

## Troubleshooting

### Common Issues
- **Database connection errors**: Ensure `DATABASE_URL` is correctly set
- **Build failures**: Check Node.js version compatibility (requires Node 20+)
- **WebSocket issues**: Ensure proper port configuration for WebSocket connections
- **Admin access**: Verify default admin credentials in environment variables

### Logs
- Server logs are output to console/stdout
- Check Railway logs in the dashboard for deployment issues
- Use `docker logs` for local Docker debugging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and ensure builds pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details