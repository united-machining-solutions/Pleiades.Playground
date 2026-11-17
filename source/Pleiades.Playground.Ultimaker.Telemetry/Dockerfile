FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
ARG VERSION=0.0.1
RUN dotnet publish Pleiades.Playground.Ultimaker.Telemetry/Pleiades.Playground.Ultimaker.Telemetry.csproj -c Release -o /publish -p:UseAppHost=false -p:ProjectVersion="$VERSION"

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine3.23
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=build /publish .
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=6s --start-period=15s --retries=3 CMD curl -fsS http://localhost:8080/health || exit 1
USER app
ENTRYPOINT ["dotnet", "Pleiades.Playground.Ultimaker.Telemetry.dll"]
