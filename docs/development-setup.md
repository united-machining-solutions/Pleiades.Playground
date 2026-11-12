# Development setup

What you need on your machine, and how to check that it works.

## Tools

| Tool | Needed for | Required |
|---|---|---|
| Git | Everything | yes |
| Docker with Compose v2 (Docker Desktop, or Docker Engine with the Compose plugin) | Starting the demo stack | yes |
| .NET 10 SDK | Building and testing `source/` | for .NET work |
| Node.js in the version of `.nvmrc` and pnpm | `apps/` and `packages/` | for TypeScript work |
| GitHub CLI (`gh`) | Pull requests, checks and logs from the terminal | recommended |
| A coding agent, for example Claude Code | Working with an agent, see [Working with Claude](working-with-claude.md) | optional |
| An MQTT client, for example `mosquitto_sub` or MQTT Explorer | Watching what the simulator publishes | optional |

The exact SDK version comes from [`global.json`](../global.json), the Node.js version from [`.nvmrc`](../.nvmrc)
and the pnpm version from [`package.json`](../package.json). Packages come from nuget.org and npmjs.org; no other
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

pnpm comes through Corepack, in the version `package.json` names. Node.js no longer brings Corepack from
version 25, so install it first:

```bash
npm install --global corepack
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
pnpm install
pnpm typecheck && pnpm test && pnpm build
docker compose up -d --build --wait
```

Every container reports healthy. <http://localhost:5500/> and <http://localhost:5510/> show the Swagger UI of the
two APIs, and <http://localhost:5600/> shows the example app (on this computer only, see `APP_BIND` in
`.env.example`). Stop the stack with `docker compose down`; add `--volumes` to drop the stored data.

## Known issues

- **The `mongodb` container stays unhealthy.** MongoDB 8.0 does not start on some very recent Linux kernels.
  CI runs the stack on `ubuntu-22.04` for that reason. `MONGODB_VERSION` in `.env` selects another image tag.
- **A port is in use.** Copy `.env.example` to `.env` and change the port there.
- **The first build fails with a download that breaks off** (`apk`, NuGet or npm, often behind a VPN or a
  proxy). Build fewer images at a time:

  ```bash
  COMPOSE_PARALLEL_LIMIT=2 docker compose up -d --build --wait
  ```

  If that helps, the cause is the network, not the repository.
- **`pnpm typecheck`, `pnpm test` or `pnpm build` fail although `pnpm install` worked.** The scripts in the
  root `package.json` call `pnpm` again, through the path. Open a new terminal and check `pnpm --version`
  there: it must answer the version `package.json` names. If it does not, run `corepack enable pnpm` again.
- **The chat still says "No language model configured" after you set a key.** `docker compose restart` does
  not read `.env` again. Create the app again: `docker compose up -d app`.
- **A second checkout replaces the containers of the first.** `compose.yaml` fixes the project name
  `pleiades-playground`. To run two checkouts side by side, give the second one its own project name and image
  tag, and other ports in its `.env`:

  ```bash
  PLEIADES_VERSION=mybranch docker compose -p pleiades-mybranch up -d --build --wait
  ```

  Use the same `-p` for `ps`, `logs` and `down`.
