# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy adapter
COPY apps/simplecam-adapter-9042 .

# Install dependencies and build
RUN npm install && \
    npm run build

# Runtime stage
FROM node:22-alpine

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json .
COPY --from=builder /app/node_modules ./node_modules

# Prune to production dependencies
RUN npm prune --omit=dev

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3042/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run adapter
CMD ["node", "dist/index.js"]
