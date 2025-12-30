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
RUN groupadd -r nodejs && useradd -r -g nodejs appuser
COPY --chown=appuser:nodejs --from=builder /app/package.json ./
COPY --chown=appuser:nodejs --from=builder /app/package-lock.json ./
COPY --chown=appuser:nodejs --from=builder /app/node_modules ./node_modules
COPY --chown=appuser:nodejs --from=builder /app/dist ./dist
COPY --chown=appuser:nodejs --from=builder /app/puzzles ./puzzles
COPY --chown=appuser:nodejs --from=builder /app/shared ./shared
COPY --chown=appuser:nodejs --from=builder /app/drizzle.config.js ./drizzle.config.js
RUN mkdir -p /app/lib/binding/node-v115-linux-x64 \
	&& cp /app/node_modules/better-sqlite3/lib/binding/node-v115-linux-x64/better_sqlite3.node /app/lib/binding/node-v115-linux-x64/ \
	&& cp /app/node_modules/sqlite3/lib/binding/node-v115-linux-x64/node_sqlite3.node /app/lib/binding/node-v115-linux-x64/ \
	&& chown -R appuser:nodejs /app/lib
RUN mkdir -p /app/data && chown appuser:nodejs /app/data
USER appuser
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
