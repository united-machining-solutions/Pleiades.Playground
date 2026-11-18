# Build context: source/. The slicer and its matching definitions come from Debian 12.
# Extract Cura's data package without installing its GUI or Python runtime.
FROM debian:bookworm-slim AS cura
ARG CURA_ENGINE_VERSION=1:4.13.0-1+b1
ARG CURA_DATA_VERSION=4.13.0-1
RUN apt-get update && apt-get install -y --no-install-recommends "cura-engine=${CURA_ENGINE_VERSION}" ca-certificates \
    && mkdir -p /opt/cura/lib /opt/cura/packages /opt/cura/licenses \
    && cd /opt/cura/packages && apt-get download "cura=${CURA_DATA_VERSION}" \
    && dpkg-deb -x cura_*.deb /opt/cura/data \
    && cp /usr/bin/CuraEngine /opt/cura/CuraEngine \
    && ldd /usr/bin/CuraEngine | awk '/=> \/.*lib/ {print $3}' | grep -Ev '/(libc|libm|libpthread|librt|libdl)\.so' | xargs -r cp -L -t /opt/cura/lib \
    && cp -r /usr/share/doc /opt/cura/licenses/debian \
    && cp -r /opt/cura/data/usr/share/doc/cura /opt/cura/licenses/ \
    && mv /opt/cura/data/usr/share/cura/resources /opt/cura/resources \
    && rm -rf /opt/cura/data /opt/cura/packages /var/lib/apt/lists/*

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
ARG VERSION=0.0.1
RUN dotnet publish Pleiades.Playground.Ultimaker.Api/Pleiades.Playground.Ultimaker.Api.csproj -c Release -o /publish -p:UseAppHost=false -p:ProjectVersion="$VERSION"

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble AS final
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* && mkdir /data && chown app:app /data
WORKDIR /app
COPY --from=cura /opt/cura /opt/cura
COPY --from=build /publish .
ENV ASPNETCORE_HTTP_PORTS=8080 \
    Ultimaker__EnginePath=/opt/cura/CuraEngine \
    Ultimaker__DefinitionsDirectory=/opt/cura/resources/definitions
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8080/healthcheck || exit 1
USER app
ENTRYPOINT ["dotnet", "Pleiades.Playground.Ultimaker.Api.dll"]
