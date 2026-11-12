# Build your own

How to add something of your own to the demo: a page, a card, or a source of data. The [tour](tour.md) shows
what is there. This page shows where your idea starts.

![Four steps from the bottom up: a source publishes to the broker, the stack stores the values, a tool computes
an answer that a card draws, and a page shows it. A page starts at the top step, a card at the step of the card
and its tool, a source at the bottom step.](images/build-your-own/ladder.svg)

A value travels up. A source publishes it, the stack stores it, a tool computes an answer from it, a card draws
the answer, and a page shows the card. Your idea starts at one of three steps. What starts lower needs the
steps above it too: a source is seen once a card shows it.

| Your idea | You build | You touch |
|---|---|---|
| A screen people open, made of answers that exist | [A page](#a-page) | `apps/app` |
| An answer that does not exist yet, to data that does | [A card](#a-card) | `packages/cards`, `apps/genui-mcp`, `apps/app` |
| Data the stack does not have yet | [A source](#a-source) | `contracts/mqtt`, a service of your own, `compose.yaml` |

Each recipe has the same four parts. The last one is a request for your coding agent, to copy as it stands.

## A page

The example: the open warnings of all machines.

**You touch** `apps/app`: one route and one line in the sidebar.

**Steps**

1. Add a file under `src/routes/`, for example `warnings.tsx`. The file is the route. The build writes it into
   `src/routeTree.gen.ts`: commit that file, never edit it.
2. Read the values in the loader of the route, with a server function from `src/machines/get-machines.ts`.
   `getMachines()` returns every machine with its open warnings and errors. The browser never talks to the
   backend itself.
3. Draw them with what is there: the rows in `src/machines/machine-item.tsx`, a card of `@pleiades/cards`, the
   shadcn/ui components under `src/components/ui/`. With `useLive()` the page reads its values again every ten
   seconds.
4. Add the page to the sidebar, in `src/components/app-sidebar.tsx`.

**Done when** the page opens at <http://localhost:5600/warnings>, shows the warnings Home shows, and
`pnpm typecheck` passes.

**Tell your agent**

> Add a page `/warnings` to `apps/app` that lists the open warnings of all machines, newest first, with the rows
> Home uses. Follow `docs/build-your-own.md`. Done when the page shows them in the running stack and
> `pnpm typecheck` passes.

More: [`apps/app`: What is where](../apps/app/README.md#what-is-where).

## A card

The example: the alarms of one machine over the last eight hours. The Events API has them; no tool answers
that question yet.

**You touch** `packages/cards` for the contract and the component, `apps/genui-mcp` for the tool, `apps/app`
for the place that draws it, and a row in [`contracts/mcp`](../contracts/mcp/README.md).

**Steps**, in full under [A new card](../packages/cards/README.md#a-new-card):

1. Write the contract and the component in a folder of their own under `packages/cards/src/`. Build the
   component from the shadcn/ui components that are there.
2. Add the tool in `apps/genui-mcp` with that contract as its output. The tool reads the APIs and computes. Its
   result has two parts: a few lines of text for a language model, and the values for the card
   ([A result is an answer](../apps/genui-mcp/README.md#a-result-is-an-answer)).
3. In the app, draw the component where the result of the tool arrives. The card then appears in the chat as
   soon as the model calls its tool, and on a page if you add one.
4. For other hosts, add a card file under `apps/genui-mcp/ui/`.
5. A series, anything that grows with time, gets a tool of its own that only the card calls.

Three rules keep a card honest. Numbers, order and durations are computed in the tool, never by a language
model. Every value names the topic or the notification it comes from. What a model reads is short.

**Done when** the chat answers "Which alarms did P-04 raise today?" with the card, and `pnpm typecheck` and
`pnpm test` pass.

**Tell your agent**

> Add a card that lists the alarms of one machine over the last eight hours. Follow "A new card" in
> `packages/cards/README.md` and `docs/build-your-own.md`. Done when the chat shows it for P-04 in the running
> stack and `pnpm typecheck` and `pnpm test` pass.

## A source

The example: the outside temperature.

> The topics for a value that belongs to a place are proposed in
> [issue 60](https://github.com/united-machining-solutions/Pleiades.Playground/issues/60) and not agreed yet.
> Until they are, read this recipe as the way it will go, and the topic below as an example.

Bring a source in at the bottom, like a machine: an adapter that publishes to the broker. Then the value is
stored, every tool, card and agent can read it, and it can be traced to where it came from. A value that a
card, a tool or the app fetches for itself is none of that.

**You touch** an issue, [`contracts/mqtt`](../contracts/mqtt/README.md), a folder with your adapter, and
`compose.yaml`.

**Steps**

1. Open an issue first. A source adds a service, and it may change a contract
   ([Contributing](../CONTRIBUTING.md#how-to-contribute)).
2. Agree the topic in `contracts/mqtt` before any code: what the value is about, the name of the source, and
   the path. One value per topic, one SI unit from the table, the time of the observation in UTC. For the
   example: `sites/demo/weather/AirTemperature` in `degreeCelsius`.
3. Write the adapter as a service of its own: a folder with a `Dockerfile` and a short README, a liveness
   endpoint, an entry in `compose.yaml` ([Adding a service](../CONTRIBUTING.md#adding-a-service)). The
   language is up to you. It fetches, converts once to the SI unit, and publishes. It says that it is there the
   way a machine does, with `Connection/State` and `Connection/Heartbeat`.
4. Check that the value is stored: the Swagger UI at <http://localhost:5500/> lists the topic under `/topics`.
5. Show it with [a card](#a-card).

A key of a source: its name goes to `.env.example`, its value into your `.env`, never into a commit. Name the
source wherever its values are shown.

**Done when** the Timeseries API lists the new topic, every container is healthy, and a card shows the value
with its source.

**Tell your agent**

> Add an adapter that publishes the outside temperature of one place to the broker, as `contracts/mqtt` and
> `docs/build-your-own.md` say. Open an issue for the topic first. Done when the Timeseries API lists the
> topic and every container is healthy.

## Which model answers

Nothing to build: the language models of the chat are settings. Everything but the chat works without one.

Copy `.env.example` to `.env`. It has three blocks, each optional: OpenAI, Anthropic, and any endpoint that
speaks OpenAI's chat completions. The third is the one for a model on your own computer:

```bash
LLM_BASE_URL=http://host.docker.internal:<port>/v1
LLM_MODELS=<a model your server has>
```

Then start the app again: `docker compose up -d app`.

- The app runs in a container, and `localhost` there is the container. With Docker Desktop your own computer
  is `host.docker.internal`.
- The model must be able to call tools. One that cannot answers without data.
- With several models, separated by commas, the chat offers each of them, and the first answers until a chat
  picks another.
