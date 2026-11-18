# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml .
COPY pnpm-lock.yaml .

# Copy adapter
COPY apps/simplecam-adapter-9042 ./apps/simplecam-adapter-9042

# Install dependencies
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

# Build TypeScript
WORKDIR /app/apps/simplecam-adapter-9042
RUN pnpm build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy built application from builder
COPY --from=builder /app/apps/simplecam-adapter-9042/dist ./dist
COPY --from=builder /app/apps/simplecam-adapter-9042/package.json .

# Install production dependencies only
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --prod

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3042/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run with dumb-init
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
