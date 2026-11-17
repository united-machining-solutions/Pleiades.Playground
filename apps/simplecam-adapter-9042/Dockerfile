# Build stage: compile TypeScript
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-workspace.yaml .
COPY pnpm-lock.yaml .

# Copy only the adapter package
COPY apps/simplecam-adapter-9042/package.json apps/simplecam-adapter-9042/
COPY apps/simplecam-adapter-9042/tsconfig.json apps/simplecam-adapter-9042/
COPY apps/simplecam-adapter-9042/src apps/simplecam-adapter-9042/src/

# Install dependencies (frozen lockfile from workspace)
RUN pnpm install --frozen-lockfile

# Build TypeScript
WORKDIR /app/apps/simplecam-adapter-9042
RUN pnpm build

# Runtime stage: minimal image with compiled code
FROM node:22-alpine
WORKDIR /app

# Install pnpm for runtime
RUN npm install -g pnpm

# Copy package files
COPY --from=builder /app/pnpm-workspace.yaml .
COPY --from=builder /app/pnpm-lock.yaml .
COPY --from=builder /app/apps/simplecam-adapter-9042/package.json ./package.json

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built code
COPY --from=builder /app/apps/simplecam-adapter-9042/dist ./dist

# Health check
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3042/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run adapter
CMD ["node", "dist/index.js"]
