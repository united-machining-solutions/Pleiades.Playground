---
title: "The example app registers at the Pleiades Hub, with the SDK as a vendored tarball"
status: proposed
date: 2026-11-18
---

# ADR-0021: The example app registers at the Pleiades Hub, with the SDK as a vendored tarball

## Context

Several apps are to run on one system, behind one page. That page is the Pleiades Hub (repository
`umati/pleiades-hub`): a header with the app launcher and the user menu, and below it the apps, each in an
iframe. The hub finds its apps over MQTT, at the broker of this repository. Its API asks on `hub/discover`,
the backend of an app answers with the list of its apps, and the SDK `@pleiades/hub-sdk` does that for an
app.

What stood in the way of the example app taking part:

- The [MQTT binding](../../contracts/mqtt/README.md) knew two first levels, `machines` and `sites`.
- The example app had no MQTT client. It reads every value from the generative UI backend.
- The SDK lives in the repository of the hub, which is private, and it is not published.
- CI and the image builds install with `pnpm install --frozen-lockfile`. They have this repository and
  cannot reach a neighbouring folder.
- [AGENTS.md](../../AGENTS.md) says that npmjs.org is the only registry and that every version stands in
  the catalog.

## Decision

- The binding gets a third first level, `hub/`, and becomes draft 0.3.0. It only reserves the level and
  says who owns it: the topics below `hub/` and their payloads are defined by the contract of the hub,
  `contracts/mqtt/README.md` in its repository. What the binding says about a value does not apply there.
- The server of `apps/app` registers the app at the hub, through the SDK, and only when it is asked to:
  with `HUB_MQTT_URL` set, the server registers when it starts. Without it nothing connects, and the app
  behaves as before. `HUB_APP_URL` names the address under which the browser of a user reaches the app.
- The demo stack asks for it. `compose.yaml` sets both variables for the `app` container: `HUB_MQTT_URL` to
  the broker of the same stack, `mqtt://broker:1883`, and `HUB_APP_URL` to `http://localhost:<APP_PORT>/`,
  the address under which a browser on the same computer reaches the app. Both stand in `.env.example`, and
  an empty `HUB_MQTT_URL` in `.env` switches the registration off. The hub itself is not part of the stack:
  it runs from its own repository and reaches the broker at the port the stack publishes on the host.
- The start is a plugin of Nitro, `apps/app/src/hub/plugin.ts`, which `apps/app/vite.config.ts` names. It
  runs when the server starts, in development and in the built server, and not with the first request. It
  signs the app off in Nitro's `close` hook. A route such as `/health` was the fallback and was not needed.
- It registers one app, `pleiades-playground`, with a label and a description in English and German and an
  icon. The icon is an SVG drawn for this app, which the server of the app serves, and it is registered as
  a link relative to the address of the app.
- The SDK is checked in as a tarball, `vendor/pleiades-hub-sdk-0.1.2.tgz`, licensed under Apache-2.0.
  The catalog in
  `pnpm-workspace.yaml` refers to it with `file:`, and `apps/app/package.json` says `"catalog:"`, like
  every other dependency. [`vendor/README.md`](../../vendor/README.md) names its version, its origin and
  its checksum. From version 0.1.1 on the tarball holds the guide `register-an-app.md`, and the repository
  holds a copy of the hub's skill `register-hub-app` under `.claude/skills/`, which leads an agent to it.
- `.dockerignore` lets `vendor` through (`!vendor`), so that the install of an image finds the tarball. No
  Dockerfile changed.

The settings, the registration and its files are described in
[`apps/app`: Pleiades Hub](../../apps/app/README.md#pleiades-hub).

Checked on 18 November 2026 with pnpm 12.18.0, on a computer without Docker:

- pnpm accepts `file:` in the catalog and resolves it against the root of the workspace. The lockfile
  records the checksum of the tarball, and `pnpm install --frozen-lockfile` passes.
- Both TypeScript images (`apps/app/Dockerfile`, `apps/genui-mcp/Dockerfile`) copy the whole build context
  (`COPY . .`) and install with `pnpm install --frozen-lockfile`. In a copy that holds exactly what
  `.dockerignore` lets through, the install of the app image passes with `vendor` and fails without it
  (`Failed to read local tarball`). The two filtered installs of the `genui-mcp` image pass either way,
  because that server does not use the SDK.
- The built server and the development server registered at the API of the hub, over an MQTT broker in the
  test process (`aedes`): the hub listed the app before any page was requested, and dropped it when the
  server stopped. Mosquitto, the broker of this repository's stack, was not part of that run.

Checked the same day with Docker Desktop on macOS (Docker 29.9.3, Compose 5.7.0):

- `docker compose config` shows the two values that the stack sets for the `app` container,
  `mqtt://broker:1883` and `http://localhost:5600/`.
- `docker compose build app` builds the image of the app from the working tree, with the tarball from
  `vendor`. The other images were not rebuilt.
- In the running stack the app registered at Mosquitto by itself. A hub in a container of its own, which
  reached the broker at the port the stack publishes on the host, listed the app, showed its icon and
  opened it in an iframe.
- `docker compose stop app` removed the app from the hub at once. After a start, and after a restart of the
  broker, it was listed again within two seconds; while the broker restarted, the app logged one line.
- A container of the image with an empty `HUB_MQTT_URL` opened no connection to the broker. One with an
  invalid `HUB_MQTT_URL` printed the line that names the variable and ended with exit code 1.

Not checked: Docker Engine on Linux, the image of `genui-mcp` built with `vendor` in its context, and CI.

## Consequences

- The repository deviates from "npmjs.org is the only registry": one package comes from a file that is
  checked in, and this record is where that is written down. The rule of the catalog is kept: the package
  stands in the catalog, and the `package.json` says `"catalog:"`.
- A binary file is in git, about 11 kB. A diff does not show what changed in it.
- The tarball can be stale. A change to the SDK reaches this repository only with a new version and a new
  tarball; `vendor/README.md` says how.
- The demo stack registers by default, in CI too, where `docker compose up -d --build --wait` starts it.
  `HUB_MQTT_URL=` in `.env` switches the registration off: `compose.yaml` takes its default only where the
  variable is not set (`${HUB_MQTT_URL-mqtt://broker:1883}`, without a colon), so an empty value reaches
  the container.
- A stack without a hub pays one idle MQTT connection. The app sends one message when it connects, and
  nobody asks on `hub/discover`. `app` has no `depends_on` for the broker: the SDK retries until the broker
  answers.
- The default of `HUB_APP_URL` in the code is the address of the development server, and the stack serves
  the app on another port. So `compose.yaml` sets that variable as well, to `http://localhost:<APP_PORT>/`.
  This address is right only for a browser on the same computer. Anything else needs `HUB_APP_URL` in
  `.env`: another host name, as when `APP_BIND` opens the app to the network, or a reverse proxy. A stack
  that is deployed registers with the default as well, until the `.env` of its computer names the address.
- Apps under a path of the hub, such as `/playground/`, stay a matter of the later deployment of the whole
  system. This stack has no proxy that would serve the app under the address of the hub.
- The app of the stack and the development server register under the same client id and the same app id,
  `pleiades-playground`. At one broker the hub keeps the list it got last, so whoever tries the
  registration in development stops the app of the stack for that time.
- The relative icon link needs the address of the app to end with `/`. With `/playground` the hub would
  look for `/hub-icon.svg`, not for `/playground/hub-icon.svg`.
- The app must stay embeddable. It sends no `X-Frame-Options` and no `frame-ancestors` today, and a proxy
  in front of it must not add them.
- The broker is anonymous, so whoever can write to it can register anything under `hub/`. The hub
  validates what it receives.
- `mqtt` 5.16.1 and with it `ws` 8.23.0 come in as dependencies, and the server bundle of the app grows by
  them: Nitro bundles them into `.output`.
- One existing dependency is touched. pnpm now also gives `ws` to `openai`, a dependency of
  `@tanstack/ai-openai`, as its optional peer, so the lockfile entries of `openai`, `@tanstack/openai-base`
  and `@tanstack/ai-openai` changed their peer suffix. No version changed.
- A broker that cannot be reached never stops the app: the SDK retries. When the server stops, the hub
  drops the app: the SDK signs off, and the broker publishes the Last Will of the client if the process
  dies. The sign-off runs after Nitro has closed the HTTP server, so a request that is still open delays
  it by up to five seconds.
- An invalid `HUB_MQTT_URL` or `HUB_APP_URL` stops the built server at its start, with one line that names
  the variable: a server that ran without the registration would look fine and be missing in the hub. The
  development server logs the line and runs on. The stack takes both values from `.env`, so a wrong line
  there ends the `app` container at its start.
- With `HUB_MQTT_URL` set, Node.js prints the deprecation warning `DEP0169` once when the built server
  starts: `mqtt` 5.16.1 reads the URL of the broker with `url.parse()`. It changes nothing today.
- A consumer that subscribes to every topic sees the messages below `hub/`. The persistence workers of the
  stack do not: they subscribe below `machines/` and `sites/`. The Timeseries persistence run from source
  in the `Development` environment does (`"Topics": ["#"]` in its `appsettings.Development.json`); a hub
  message is no value, so it logs a warning for it and stores nothing. Since the stack registers by
  default, such messages are on its broker without anyone having set a variable.
- The tarball holds code from the hub's private repository. Its `package.json` declares `Apache-2.0`, and the
  tarball includes the corresponding `LICENSE` file.

## Alternatives considered

- **Publish the SDK on npmjs.org.** The cleanest: no file in git and no deviation. But someone with rights
  on the scope has to publish, and until then every install fails. Once it is published, a version in the
  catalog takes the place of the file.
- **A git dependency on the repository of the hub.** CI and the image builds would need credentials for a
  private repository.
- **A `file:` or workspace link to the neighbouring folder.** It works on the computer of one developer
  only.
- **Register from a .NET service under `source/`.** There is no C# library of the SDK yet, and the thing a
  user opens is the app.
- **Register from the browser.** Every browser would need access to the broker, and the app would be
  registered only while someone has it open.
