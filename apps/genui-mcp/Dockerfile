# Build context: the repository root (docker build -f apps/genui-mcp/Dockerfile .).
# Nothing is compiled: Node.js runs the TypeScript files as they are. The build stage only collects
# the package with its production dependencies, which are plain JavaScript, so one stage serves
# every target architecture; --platform=$BUILDPLATFORM keeps it native on the build machine.
FROM --platform=$BUILDPLATFORM node:26.13-alpine3.24 AS build
WORKDIR /repo
COPY . .
# pnpm in the version that package.json names as "packageManager".
RUN npm install --global --ignore-scripts "$(node --print 'require("./package.json").packageManager')" && \
    pnpm install --frozen-lockfile && \
    pnpm --filter @pleiades/genui-mcp deploy --prod /deploy

# The Alpine minor is pinned on purpose, as in the images under source/.
FROM node:26.13-alpine3.24 AS final
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
COPY --from=build /deploy .
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1:8080/health || exit 1
USER node
ENTRYPOINT ["node", "src/main.ts"]
