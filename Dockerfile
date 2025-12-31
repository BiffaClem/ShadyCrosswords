# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .

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
RUN mkdir -p /app/data && chown appuser:nodejs /app/data
USER appuser
EXPOSE 5000
CMD ["node", "dist/index.cjs"]
