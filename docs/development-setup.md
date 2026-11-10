# Development setup

What you need on your machine, and how to check that it works.

## Tools

| Tool | Needed for | Required |
|---|---|---|
| Git | Everything | yes |
| Docker with Compose v2 (Docker Desktop, or Docker Engine with the Compose plugin) | Starting the demo stack | yes |
| .NET 10 SDK | Building and testing `source/` | for .NET work |
| Node.js LTS and pnpm | `apps/` and `packages/` | for TypeScript work |
| GitHub CLI (`gh`) | Pull requests, checks and logs from the terminal | recommended |
| A coding agent, for example Claude Code | Working with an agent, see [Working with Claude](working-with-claude.md) | optional |
| An MQTT client, for example `mosquitto_sub` or MQTT Explorer | Watching what the simulator publishes | optional |

The exact SDK version comes from [`global.json`](../global.json). NuGet packages come from nuget.org; no other
feed and no secret is needed.

## Install

Windows, with winget:

```powershell
winget install --id Git.Git
winget install --id Docker.DockerDesktop
winget install --id Microsoft.DotNet.SDK.10
winget install --id OpenJS.NodeJS.LTS
winget install --id GitHub.cli
```

macOS, with Homebrew:

```bash
brew install git gh node
brew install --cask docker dotnet-sdk
```

Linux: use the packages of your distribution or the installers of [Docker](https://docs.docker.com/engine/install/),
[.NET](https://learn.microsoft.com/dotnet/core/install/linux), [Node.js](https://nodejs.org/) and the
[GitHub CLI](https://github.com/cli/cli#installation).

pnpm comes with Node.js through Corepack:

```bash
corepack enable pnpm
```

Open a new terminal after installing, so that the new commands are on the path.

## Sign in

```bash
gh auth login --hostname github.com --git-protocol https --web
```

You sign in yourself, in the browser. Never paste a token into a chat, a prompt or a file of this repository.

## Check

```bash
git --version
docker compose version
dotnet --version
gh auth status
```

Then build, test and start:

```bash
cd source
dotnet build Pleiades.Playground.slnx
dotnet test --solution Pleiades.Playground.slnx
cd ..
docker compose up -d --build --wait
```

Every container reports healthy, and <http://localhost:5500/> and <http://localhost:5510/> show the Swagger UI
of the two APIs. Stop the stack with `docker compose down`; add `--volumes` to drop the stored data.

## Known issues

- **The `mongodb` container stays unhealthy.** MongoDB 8.0 does not start on some very recent Linux kernels.
  CI runs the stack on `ubuntu-22.04` for that reason. `MONGODB_VERSION` in `.env` selects another image tag.
- **A port is in use.** Copy `.env.example` to `.env` and change the port there.
