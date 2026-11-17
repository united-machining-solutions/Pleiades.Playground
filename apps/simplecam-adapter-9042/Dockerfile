# Build stage: compile TypeScript
FROM node:22-alpine AS builder
WORKDIR /workspace

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy adapter package
COPY apps/simplecam-adapter-9042 apps/simplecam-adapter-9042/

# Install dependencies (frozen lockfile from workspace)
RUN pnpm install --frozen-lockfile --filter=@pleiades/simplecam-adapter-9042

# Build TypeScript
WORKDIR /workspace/apps/simplecam-adapter-9042
RUN pnpm build

# Runtime stage: minimal image with compiled code
FROM node:22-alpine
WORKDIR /app

# Install pnpm for runtime
RUN npm install -g pnpm

# Copy from builder
COPY --from=builder /workspace/pnpm-workspace.yaml .
COPY --from=builder /workspace/pnpm-lock.yaml .
COPY --from=builder /workspace/apps/simplecam-adapter-9042/package.json .
COPY --from=builder /workspace/apps/simplecam-adapter-9042/dist ./dist

# Install only production dependencies for this filter
RUN pnpm install --frozen-lockfile --filter=@pleiades/simplecam-adapter-9042 --prod

# Health check
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3042/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run adapter
CMD ["node", "dist/index.js"]
