# Build context: the repository root (docker build -f apps/app/Dockerfile .).
# The build output is plain JavaScript, so one stage serves every target architecture;
# --platform=$BUILDPLATFORM keeps the build native on the build machine.
FROM --platform=$BUILDPLATFORM node:26.13-alpine3.24 AS build
WORKDIR /repo
COPY . .
# The build the sidebar of the app names: the workflow "Images" passes the version, the commit and the
# repository, as the image labels org.opencontainers.image.version, .revision and .source say them.
# A build without them is "dev". The build reads them as APP_VERSION, APP_REVISION and APP_SOURCE, names
# that no other tool sets (apps/app/vite.config.ts).
ARG VERSION=dev
ARG REVISION=
ARG SOURCE=
# pnpm in the version that package.json names as "packageManager".
RUN npm install --global --ignore-scripts "$(node --print 'require("./package.json").packageManager')" && \
    pnpm install --frozen-lockfile && \
    APP_VERSION="$VERSION" APP_REVISION="$REVISION" APP_SOURCE="$SOURCE" pnpm --filter @pleiades/app build

# The Alpine minor is pinned on purpose, as in the images under source/.
FROM node:26.13-alpine3.24 AS final
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
# .output is self-contained: the server bundle and the static files, no node_modules.
COPY --from=build /repo/apps/app/.output .output
# The licence and the notices travel with the image.
COPY --from=build /repo/LICENSE /repo/NOTICE ./
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO /dev/null http://127.0.0.1:8080/health || exit 1
USER node
ENTRYPOINT ["node", ".output/server/index.mjs"]
