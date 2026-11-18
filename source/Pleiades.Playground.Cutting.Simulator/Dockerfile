# Build context: source/ (docker build -f source/Pleiades.Playground.Cutting.Simulator/Dockerfile source).
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
ARG VERSION=0.0.1
RUN dotnet publish "Pleiades.Playground.Cutting.Simulator/Pleiades.Playground.Cutting.Simulator.csproj" -c Release -o /app/publish -p:UseAppHost=false -p:ProjectVersion="$VERSION"

# The Alpine minor is pinned on purpose; bump it deliberately.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine3.23 AS final
# /data keeps the production plan and the stock across restarts.
# /exchange holds the telegram files. The host is another container with another user, and it deletes the file the
# machine wrote once it has read it, so every user may write the folder. A new named volume takes this mode.
RUN apk add --no-cache curl && addgroup -S nonroot && adduser -S nonroot -G nonroot \
    && mkdir -p /data /exchange && chown nonroot:nonroot /data /exchange && chmod 0777 /exchange
VOLUME ["/data", "/exchange"]
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=build /app/publish .
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD curl -fsS http://localhost:8080/healthcheck || exit 1
USER nonroot
ENTRYPOINT ["dotnet", "Pleiades.Playground.Cutting.Simulator.dll"]
