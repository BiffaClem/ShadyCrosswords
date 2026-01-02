# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
RUN rm -rf node_modules/better-sqlite3/build
RUN npm rebuild better-sqlite3
RUN mkdir -p node_modules/better-sqlite3/lib/binding/node-v115-linux-x64 && cp node_modules/better-sqlite3/build/Release/better_sqlite3.node node_modules/better-sqlite3/lib/binding/node-v115-linux-x64/
RUN npm rebuild sqlite3
RUN mkdir -p node_modules/sqlite3/lib/binding/node-v115-linux-x64 && cp node_modules/sqlite3/build/Release/node_sqlite3.node node_modules/sqlite3/lib/binding/node-v115-linux-x64/
RUN npm run build && npm prune --production

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
RUN groupadd -r nodejs && useradd -r -g nodejs appuser && chown -R appuser:nodejs /app
COPY --from=builder --chown=appuser:nodejs /app/package.json ./
COPY --from=builder --chown=appuser:nodejs /app/package-lock.json ./
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/puzzles ./puzzles
COPY --from=builder --chown=appuser:nodejs /app/shared ./shared
COPY --from=builder --chown=appuser:nodejs /app/drizzle.config.js ./drizzle.config.js
RUN mkdir -p /app/lib/binding/node-v115-linux-x64 && cp /app/node_modules/better-sqlite3/lib/binding/node-v115-linux-x64/better_sqlite3.node /app/lib/binding/node-v115-linux-x64/ && cp /app/node_modules/sqlite3/lib/binding/node-v115-linux-x64/node_sqlite3.node /app/lib/binding/node-v115-linux-x64/
RUN mkdir -p /app/data
USER appuser
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
