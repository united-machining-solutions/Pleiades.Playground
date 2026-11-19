# Build context: source/ (docker build -f source/Pleiades.Playground.Bend.Adapter/Dockerfile source).
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
ARG VERSION=0.0.1
RUN dotnet publish "Pleiades.Playground.Bend.Adapter/Pleiades.Playground.Bend.Adapter.csproj" -c Release -o /app/publish -p:UseAppHost=false -p:ProjectVersion="$VERSION"

# The Alpine minor is pinned on purpose; bump it deliberately.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine3.23 AS final
# /exchange holds the telegram files of the machine. The adapter only reads them, but whichever container mounts a
# new named volume first gives it its mode, and the machine, another user, has to write it: so every user may.
# tzdata: Config__MachineTimeZone names the time zone of a real machine, whose telegrams carry local time.
RUN apk add --no-cache curl tzdata && addgroup -S nonroot && adduser -S nonroot -G nonroot \
    && mkdir -p /exchange && chmod 0777 /exchange
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=build /app/publish .
# /healthcheck fails while the adapter is not connected to the broker. A machine that is off is not a fault of
# the adapter: Connection/State says that on the broker.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD curl -fsS http://localhost:8080/healthcheck || exit 1
USER nonroot
ENTRYPOINT ["dotnet", "Pleiades.Playground.Bend.Adapter.dll"]
