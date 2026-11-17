# Deployment

How the demo stack runs on one computer and follows `main`. The repository builds nothing there: the workflow
[`deploy.yml`](../.github/workflows/deploy.yml) starts the stack with `docker compose` from the images that
[`images.yml`](../.github/workflows/images.yml) publishes.

The deployment is optional and off by default. Whoever only wants to see the demo needs none of this, see
[Start](../README.md#start).

## How it goes

1. A pull request is merged into `main`.
2. "Images" builds the service images, including the optional Ultimaker and juice bar services, and tags them
   `main` and `sha-<commit>`.
3. "Deploy" runs after it on a runner of your own, on the computer that runs the stack. It checks out the
   commit, pulls the images tagged `sha-<commit>` and runs `docker compose up -d --no-build --wait`.

The stack keeps its data: the project name is fixed, so its volumes stay from one deployment to the next.

## What the computer needs

- Docker with Compose v2, and a way out to `ghcr.io` and `github.com` on port 443. Nothing has to reach the
  computer from outside.
- A [self-hosted runner](https://docs.github.com/actions/hosting-your-own-runners) of this repository with the
  label `pleiades-deploy`, run by a user who may use Docker.
- A folder for the settings that belong to the computer and not to the repository:

  | File | What it holds |
  |---|---|
  | `.env` | The settings of [`.env.example`](../.env.example): ports, `APP_BIND`, the address and the key of the LiteLLM gateway. It is never part of a commit. |
  | `compose.override.yaml` | Optional. What only this computer needs, for example the network of a reverse proxy. |

## What the repository needs

| Setting | Value |
|---|---|
| Variable `DEPLOY_ENABLED` | `true`. Any other value, or none, and "Deploy" does not run. |
| Variable `DEPLOY_DIR` | The folder above, as a path on the runner. |
| Environment `demo` | Deployment branches: `main` only. |

## Before you add a runner to a public repository

A runner of your own runs what a workflow tells it, with the rights of its user, and a user who may use Docker
may do anything on that computer. A pull request from a fork brings its own workflow files and can name the
runner in them. The protection of `main` does not help against that: nothing is merged.

- Set **Settings → Actions → General → Approval for running fork pull request workflows** to "Require
  approval for all external contributors". Then no workflow from outside runs before a maintainer has read it.
- Read the workflow files of a pull request from outside before you approve its run.
- Give the runner a computer that holds nothing else of value, or accept what shares it.

"Deploy" itself always runs the workflow file of `main`: it starts from the workflow "Images", not from a
pull request.

## By hand

The same as the workflow does, in the folder of a checkout:

```bash
PLEIADES_VERSION=main docker compose --env-file /path/to/.env up -d --no-build --wait
```

"Deploy" can also be started by hand, under Actions, for the newest commit of `main`.

## Enable the Ultimaker services

Both `ultimaker-api` (CuraEngine, REST and MCP) and `ultimaker-telemetry` (printer to MQTT) are
defined in the root Compose file under the optional `ultimaker` profile. The Images workflow
publishes both to GHCR with the same commit tags as the other services. A feature-branch push
does not publish deployment images; merge to main first, or build the branch locally.

Set these values in the deployment computer's private `.env` in DEPLOY_DIR:

```dotenv
COMPOSE_PROFILES=ultimaker
ULTIMAKER_PRINTER_URL=http://ultimaker.local/
ULTIMAKER_MACHINE_ID=UM3-01
ULTIMAKER_ENABLE_PRINTING=false
```

Replace the example printer URL with the actual reachable address. Compose reads COMPOSE_PROFILES
from the same --env-file used by the deployment workflow, so no workflow edit or override file is
needed to enable the services. Leave it empty on computers without this printer. Telemetry waits
for the existing broker and time-series persistence; it does not need pairing or print permission.

To deploy both from images after they have been published:

```bash
PLEIADES_VERSION=main docker compose --env-file /path/to/.env pull
PLEIADES_VERSION=main docker compose --env-file /path/to/.env up -d --no-build --wait
```

To build the feature branch before it is merged:

```bash
docker compose --profile ultimaker up -d --build --wait ultimaker-api ultimaker-telemetry
```

The API listens on host loopback port 5530 by default. For remote MCP access, use the deployment's
reverse proxy and configure the existing Ultimaker authentication settings; do not expose the
anonymous local-development setting to an untrusted network. See the
[API guide](../source/Pleiades.Playground.Ultimaker.Api/README.md) and
[telemetry guide](../source/Pleiades.Playground.Ultimaker.Telemetry/README.md).

The named `ultimaker_data` volume preserves models, slices, pairing credentials and submission
records across deployments of the same Compose project. A new server has a new volume and must
be paired through its API with approval on the printer display. Starting the stack never pairs,
enables printing or starts a print automatically.

## Enable the juice bar service

`juicebar-api` (REST, MCP and the state of the machine on MQTT) is defined in the root Compose file under
the optional `juicebar` profile. The Images workflow publishes it with the same commit tags as the other
services. It needs a machine that runs MixerControl and that the deployment computer reaches.

Set these values in the private `.env` of the deployment computer in DEPLOY_DIR:

```dotenv
COMPOSE_PROFILES=juicebar
JUICEBAR_URL=http://juicebar.local:3000/
JUICEBAR_MACHINE_ID=JUICEBAR-01
JUICEBAR_ENABLE_ORDERING=true
APP_MCP_SERVERS=juicebar=http://juicebar-api:8080/mcp
```

Replace the example address with the one of the machine. Profiles combine with a comma, and so do the
entries of `APP_MCP_SERVERS`: `COMPOSE_PROFILES=ultimaker,juicebar`. Leave both without the juice bar on a
computer that does not reach one: the service starts and stays healthy without the machine, but the chat
would offer tools that only answer with an error.

`JUICEBAR_ENABLE_ORDERING=true` lets the service place orders at the real machine; it never starts the
production, a person presses the start button. `false` makes it read-only. `APP_MCP_SERVERS` gives the chat
of the example app the tools of the service, the one for ordering among them, and the chat has no sign-in:
everyone who reaches the app can then order. Leave the entry out to keep the chat away from the machine.

The service listens on host loopback port 5550 by default. Before `JUICEBAR_BIND` opens it to a network,
switch sign-in on with `JUICEBAR_AUTH_ENABLED=true` and the three `JUICEBAR_AUTH_*` values; the chat of the
example app sends no token and does not reach the service then. See the
[service guide](../source/Pleiades.Playground.JuiceBar.Api/README.md).
