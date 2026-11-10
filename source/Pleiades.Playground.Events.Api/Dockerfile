# Build context: source/ (docker build -f source/Pleiades.Playground.Events.Api/Dockerfile source).
# The SDK stage publishes a portable, framework-dependent app, so one stage serves every target
# architecture; --platform=$BUILDPLATFORM keeps the build native on the build machine.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
ARG VERSION=0.0.1
RUN dotnet publish "Pleiades.Playground.Events.Api/Pleiades.Playground.Events.Api.csproj" -c Release -o /app/publish \
    -p:UseAppHost=false -p:ProjectVersion="$VERSION"

# The Alpine minor is pinned on purpose: a floating tag would move to a new Alpine release without a
# change in this repository. Bump it deliberately, base security patches arrive with the patch level.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine3.23 AS final
RUN apk add --no-cache curl jq && addgroup -S nonroot && adduser -S nonroot -G nonroot
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=build /app/publish .
USER nonroot
# Liveness, not readiness: a reverse proxy that routes by container health drops the route of an
# unhealthy container, so a MongoDB outage probed here would turn every route into 404, /healthcheck
# included. /healthcheck stays the diagnosis; the persistence worker image keeps probing it.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1
ENTRYPOINT ["dotnet", "Pleiades.Playground.Events.Api.dll"]
