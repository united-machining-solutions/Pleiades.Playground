# Margo app

The demo stack as a [Margo](https://margo.sh) application, so that an orchestrator installs it on an edge device
the way it installs any other app. The folder is a project of `bart`, the FLECS tool that validates a
Margo app, packages it and pushes it to a registry; `bart init` scaffolded it.

```text
margo/
├── app/                      The catalog entry
│   ├── margo.yaml            ApplicationDescription: id, metadata, deployment profile, parameters, settings
│   ├── description.md        Shown in the catalog
│   ├── release-notes.md
│   ├── license.txt           Copy of LICENSE
│   └── icon.svg
└── compose/                  The component: everything here goes into the package
    └── compose.yaml          The demo stack, with Traefik in front of the example app
```

## How it differs from `compose.yaml`

`compose/compose.yaml` runs the same twelve containers as [`compose.yaml`](../compose.yaml) at the root, written so
that bart accepts it, and one more, Traefik:

- **No `build:`.** The services take the images that the workflow "Images" publishes to
  `ghcr.io/united-machining-solutions`, for `linux/amd64` and `linux/arm64`. `bart build` does not fit here: it
  builds `src/<service>/Dockerfile` with that folder as the context, and every image of this repository needs
  `source/` or the root as its context.
- **Literal image references.** bart mirrors each `image:` as it stands and does not interpolate it, so there is
  no `${PLEIADES_VERSION}` and no `${MONGODB_VERSION}`. The images of this repository are on `main`; see
  [Release](#release).
- **No YAML anchors.** bart's compose parser does not resolve merge keys (`<<: *service`), so every service
  says everything itself.
- **The configurations are inline `configs:` entries** (`content:`), not files: the Margo client does not mount
  a file of the package into a container, and a bind mount may not leave `compose/`. Compose interpolates
  `${VAR}` in `content:`, so a literal dollar sign is written `$$`. The broker configuration is a copy; keep it
  the same as `stacks/broker/mosquitto.conf`:

  ```bash
  diff stacks/broker/mosquitto.conf \
    <(docker compose -f margo/compose/compose.yaml config --format json | jq -j '.configs.mosquitto.content')
  ```

- **Traefik in front of the example app.** It serves the app on the HTTP port (setting *HTTP port of Traefik*,
  80) and the HTTPS port (*HTTPS port of Traefik*, 443), both on `127.0.0.1` unless the setting *Address of
  Traefik* opens them to the network, under two host names:
  *Host name of the app*, a CNAME of the device, and *Host name of the device*, its A record. Their defaults, `pleiades.example.internal` and `device.example.internal`, are placeholders: set both
  to the names of your device when you install the app. Traefik reads its route from
  the `configs:` entry `traefik`, and not from Docker labels: those need the Docker socket,
  a bind mount out of `compose/`. The configuration is a Go template that takes the host names from the environment.
- **HTTPS with a self-signed certificate.** The host names are internal to the device, so no public CA can
  sign them and ACME cannot reach them. Traefik is given no certificate and serves the one it generates in
  memory at start, `TRAEFIK DEFAULT CERT`: no file, no volume, no Docker socket. A browser warns until the
  person accepts it; a new one comes with every restart of Traefik. The app works over both, so HTTP is not
  redirected to HTTPS.
- **Live values over HTTPS through Traefik.** A page over HTTPS may not open `ws://`, and the broker speaks no
  TLS. So Traefik forwards the path `/mqtt` of its HTTPS port to the broker's WebSocket, and the app's
  `MQTT_WSS_PATH: /mqtt` sends the browser there, at the origin of the page. Over HTTP the browser reaches the
  broker at the published port, `MQTT_WS_PORT`, as before.

  ```bash
  curl -k --resolve device.example.internal:443:127.0.0.1 https://device.example.internal/
  ```

  `curl -k https://localhost/` gets a 404: the route needs one of the two host names, in the Host header and
  the SNI.
- **Settings, not `.env`.** Every `${VAR}` of the compose file is a parameter in `app/margo.yaml`, and each one
  is a setting the person who installs the app can change: the ports, the address of the example app, the
  retention and the language models. The default after `:-` in the compose file is the same as the value of the
  parameter.

A change to the stack in `compose.yaml` belongs here as well, in the same pull request. CI checks that both files
name the same services (leaving out the ones behind a profile, and Traefik) and that the broker configuration is
the same; the rest, the variables and the settings, it does not see.

## External MCP servers

The *Further MCP servers* setting in *Language model* maps to `APP_MCP_SERVERS`, using comma-separated
`name=address` entries. For a documentation app deployed separately on the same device, use
`docs=http://host.docker.internal:3202/mcp`. The app maps that name to the host gateway on Docker Engine
on Linux as well as Docker Desktop. The MCP listener and its published port must be reachable from the
Playground container; a loopback-only host port may not work on Linux. Configure the documentation
service to accept `host.docker.internal` as a Host header and expose it only on a controlled network.

Enable `docs` under *Tools* in the chat. The service's contract and source/PDF requirements are in
[contracts/docs](../contracts/docs/README.md). A gateway or chat model is still required for chat.

## Check

```bash
bart validate --dir margo
bart package --dir margo --version 0.1.0 --out /tmp/margo-dist
```

`package` writes the catalog, the components tarball (the compose file with every image rewritten to the staging
registry, and the broker configuration) and `images/manifest.yaml`. It reads no registry and needs no
credentials. `dist/` is ignored by git.

## Release

A version tag releases the app. bart takes the version from `--version`, so the working tree need not be clean.

1. Add the release to `app/release-notes.md`, on `main`.
2. Tag the commit `v1.2.3` and push the tag.
3. The workflow "Images" publishes the images of this repository as `1.2.3`. When all of them are there, it calls
   the workflow [`margo-push.yml`](../.github/workflows/margo-push.yml), which:
   - pins the images of this repository in `compose/compose.yaml` from `:main` to `:1.2.3`, in that run only,
     so that the app is exactly that build;
   - runs `bart validate` and `bart push --version 1.2.3` from the image of bart 0.5.0-rc, pinned by its digest in
     the workflow, the same as in CI. The job hands that image the credentials of the registry; a new version of
     bart is a change to both workflows, in a pull request.

   `push` copies every image to `<registry>/staging-<app id>/<service>:1.2.3` on the staging registry
   (`apps.flecs.tech`), so the staged app no longer depends on ghcr.io. The images on ghcr.io are public and need
   no `--pull-auth`.
4. `bart release` promotes the staged version to production and `bart sign` signs it; both are for whoever runs
   the registry.

The job runs in the GitHub environment `margo-staging`. It holds the secrets `BART_REGISTRY_USER` and
`BART_REGISTRY_TOKEN`, the credentials of the staging registry, and its protection rules decide who may release:
set required reviewers and limit it to `main` and the tags `v*`. "Margo push" can also be started by hand, under Actions, with
a version tag (`v1.2.3`) whose images are already on ghcr.io; it checks out that tag, whatever branch it was started
from.

By hand, the same as the workflow does:

```bash
git checkout v1.2.3
sed -Ei 's|^(\s*image:\s*ghcr\.io/[^/]+/pleiades\.playground\.[a-z.]+):main$|\1:1.2.3|' margo/compose/compose.yaml
BART_REGISTRY_USER=... BART_REGISTRY_TOKEN=... bart push --dir margo --version 1.2.3
git checkout margo/compose/compose.yaml
```

Every pull request that changes `margo/`, `compose.yaml` or the broker configuration runs the job "Margo app
validates" in the workflow "CI": `bart validate`, the comparison with `compose.yaml`, and the stack itself,
started until every container is healthy, with one request to the app through Traefik. The job first builds the
images of the pull request from `compose.yaml` with `PLEIADES_VERSION=main`, the tag this file names, so the
stack runs the code of the pull request, and a new service works before "Images" has published it.

The three simulators share one image. bart rewrites them all to the copy of one of them; that is the same image
and changes nothing.

## Security

The app keeps the demo's settings: the MQTT broker accepts anonymous clients, the APIs have authorization
switched off, and the chat has no sign-in; with a key set the chat spends that key. The app's own port and
Traefik answer on `127.0.0.1` of the device unless the settings *Address of the example app* and *Address of
Traefik* open them. Traefik's host names are no guard: a client sends the Host header it likes. Open them, and
the broker and the APIs, only in a network you control.
