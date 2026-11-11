# Pleiades Playground

An open playground for machine data: adapters publish to an MQTT broker, services persist time series and
notification events, and every service offers the same data over REST and over the Model Context Protocol (MCP),
so applications and AI agents use one set of tools.

The repository is a monorepo so that the whole demo case starts with one command. What proves itself here moves
out of the playground later.

> **Status: playground.** Interfaces may change without notice. Do not run this in production.

## Start

```bash
docker compose up -d --build
```

| Service | URL | What it is |
|---|---|---|
| Timeseries API | <http://localhost:5500/> | Swagger UI, OpenAPI at `/openapi/v1.json`, MCP at `/mcp` |
| Events API | <http://localhost:5510/> | Swagger UI, OpenAPI at `/openapi/v1.json`, MCP at `/mcp` |
| MQTT broker | `localhost:1883` | Anonymous in the demo network |
| Generative UI backend | <http://localhost:5520/mcp> | MCP server for displays, see [`apps/genui-mcp`](apps/genui-mcp/README.md) |
| Example app | <http://localhost:5600/> | What every machine does now, and a chat about it; see [`apps/playground-app`](apps/playground-app/README.md) |

The simulator publishes values, states and notifications for three machines as soon as the stack is healthy.
Copy `.env.example` to `.env` to change ports or the simulated machines. No secret is needed for the demo.

## Architecture

Four layers, three agreed interfaces. Everything below the solution layer is the shared base.

| Layer | What lives there | In this repository |
|---|---|---|
| Solution | Applications that people use | `apps/` (the example app) |
| Agentic | A harness that talks to a language model and calls tools | bring your own (any MCP client), `apps/` later |
| Tool | Time series, events and cards over REST and MCP | `source/*.Timeseries.Api`, `source/*.Events.Api`, `apps/` (cards) |
| Data | Adapters, broker, persistence | `source/*.Simulator`, `source/*.Persistence`, broker config in `stacks/` |

| Agreed interface | Contract | Where |
|---|---|---|
| Data | Topics, value envelope and units on the broker | [`contracts/mqtt`](contracts/mqtt/README.md), [`contracts/datamodel`](contracts/datamodel/README.md) |
| Interfaces | REST (OpenAPI) and MCP tools | [`contracts/openapi`](contracts/openapi/README.md), [`contracts/mcp`](contracts/mcp/README.md) |
| Runtime | Every service is a container image | `Dockerfile` next to each service, [`compose.yaml`](compose.yaml) |

Anyone who keeps the contracts may bring their own implementation.

## Repository layout

```text
apps/         TypeScript applications, one container each
packages/     TypeScript packages shared by the apps
source/       .NET solution: services, libraries and tests, one project per folder
contracts/    The agreed interfaces as files: data model, MQTT binding, OpenAPI, MCP tools
stacks/       Configuration of third-party containers (broker)
docs/         Architecture, decisions (ADR) and guides
.github/      CI workflows and templates
compose.yaml  The demo stack
```

Project and image names follow one pattern: `Pleiades.Playground.<Area>.<Part>` in .NET and
`pleiades.playground.<area>.<part>` for images, for example `pleiades.playground.timeseries.api`.

## Build and test

```bash
cd source
dotnet build Pleiades.Playground.slnx
dotnet test --solution Pleiades.Playground.slnx
```

The solution needs the .NET 10 SDK and nuget.org, nothing else.

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build
```

The TypeScript workspace (`apps/`, `packages/`) needs Node.js in the version of `.nvmrc`, pnpm in the version of
`package.json` and npmjs.org, nothing else. Every version is pinned once, in the catalog of `pnpm-workspace.yaml`.

## Units

Every numeric value is in its coherent SI unit. Energy is in joule, ratios and percentages are fractions with the
unit `one` (1.0 = 100 %). Displays convert, the wire does not. See
[ADR-0002](docs/adr/0002-si-units-joule-and-one.md).

## Contributing, security, licence

- [CONTRIBUTING.md](CONTRIBUTING.md): pull requests, sign-off (DCO), checks.
- [SECURITY.md](SECURITY.md): how to report a vulnerability.
- Code and contracts: [Apache-2.0](LICENSE). Documentation and demo content: [CC BY 4.0](LICENSE-docs).
- The data model referenced in `contracts/datamodel` is a separate project with its own licence.
