# Build context: the repository root (docker build -f apps/simplecam-adapter-9042/Dockerfile .).
# The adapter is not compiled: Node.js runs its TypeScript files as they are. Only the production
# dependencies are installed, so the build stages serve every target architecture;
# --platform=$BUILDPLATFORM keeps them native on the build machine.
FROM --platform=$BUILDPLATFORM node:26.13-alpine3.24 AS workspace
WORKDIR /repo
COPY . .
# pnpm in the version that package.json names as "packageManager".
RUN npm install --global --ignore-scripts "$(node --print 'require("./package.json").packageManager')"

# The production dependencies of this adapter.
FROM workspace AS build
RUN pnpm install --frozen-lockfile --prod --filter "@pleiades/simplecam-adapter-9042..."

# The Alpine minor is pinned on purpose, as in the images under source/.
FROM node:26.13-alpine3.24 AS final
WORKDIR /app
ENV NODE_ENV=production HEALTH_PORT=8080
EXPOSE 8080
# The image keeps the layout of the workspace, cut down to this adapter. Node.js runs TypeScript
# only outside node_modules, and pnpm links a workspace package into node_modules where it lies.
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/apps/simplecam-adapter-9042 apps/simplecam-adapter-9042
# The licence and the notices travel with the image. Each package under node_modules keeps its own.
COPY --from=build /repo/LICENSE /repo/NOTICE ./
WORKDIR /app/apps/simplecam-adapter-9042
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1:8080/health || exit 1
USER node
ENTRYPOINT ["node", "src/index.ts"]
