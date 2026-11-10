# Build context: source/ (docker build -f source/Pleiades.Playground.Timeseries.Persistence/Dockerfile source).
# The SDK stage publishes a portable, framework-dependent app, so one stage serves every target
# architecture; --platform=$BUILDPLATFORM keeps the build native on the build machine.
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
ARG VERSION=0.0.1
RUN dotnet publish "Pleiades.Playground.Timeseries.Persistence/Pleiades.Playground.Timeseries.Persistence.csproj" -c Release -o /app/publish         -p:UseAppHost=false -p:ProjectVersion="$VERSION"

# The Alpine minor is pinned on purpose: a floating tag would move to a new Alpine release without a
# change in this repository. Bump it deliberately, base security patches arrive with the patch level.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine3.23 AS final
RUN apk add --no-cache curl &&     addgroup -S nonroot &&     adduser -S nonroot -G nonroot
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=build /app/publish .
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3     CMD curl -fsS http://localhost:8080/healthcheck || exit 1
USER nonroot
ENTRYPOINT ["dotnet", "Pleiades.Playground.Timeseries.Persistence.dll"]
