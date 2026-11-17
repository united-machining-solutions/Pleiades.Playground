# Build context: source/ (docker build -f source/Pleiades.Playground.Cutting.Adapter/Dockerfile source).
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
ARG VERSION=0.0.1
RUN dotnet publish "Pleiades.Playground.Cutting.Adapter/Pleiades.Playground.Cutting.Adapter.csproj" -c Release -o /app/publish -p:UseAppHost=false -p:ProjectVersion="$VERSION"

# The Alpine minor is pinned on purpose; bump it deliberately.
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine3.23 AS final
# /exchange holds the telegram files, shared with the machine, which runs as another user. The adapter deletes the
# file the machine wrote once it has read it, so every user may write the folder. A new named volume takes
# this mode.
RUN apk add --no-cache curl && addgroup -S nonroot && adduser -S nonroot -G nonroot \
    && mkdir -p /exchange && chown nonroot:nonroot /exchange && chmod 0777 /exchange
VOLUME ["/exchange"]
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=build /app/publish .
# /healthcheck fails while the adapter is not connected to the broker. A machine that is off is not a fault of
# the adapter: Connection/State says that on the broker.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD curl -fsS http://localhost:8080/healthcheck || exit 1
USER nonroot
ENTRYPOINT ["dotnet", "Pleiades.Playground.Cutting.Adapter.dll"]
