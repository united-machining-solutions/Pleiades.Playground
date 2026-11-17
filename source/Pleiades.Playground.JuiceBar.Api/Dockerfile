# Build context: source/ (docker build -f source/Pleiades.Playground.JuiceBar.Api/Dockerfile source).
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
ARG VERSION=0.0.1
RUN dotnet publish "Pleiades.Playground.JuiceBar.Api/Pleiades.Playground.JuiceBar.Api.csproj" -c Release -o /app/publish -p:UseAppHost=false -p:ProjectVersion="$VERSION"

# The Alpine minor is pinned on purpose; bump it deliberately.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine3.23 AS final
RUN apk add --no-cache curl
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=build /app/publish .
# Liveness only: the container is healthy while the machine is switched off.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD curl -fsS http://localhost:8080/health || exit 1
USER app
ENTRYPOINT ["dotnet", "Pleiades.Playground.JuiceBar.Api.dll"]
