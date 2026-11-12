# Build your own

How to add something of your own to the demo: a page, a card, or a source of data. The [tour](tour.md) shows
what is there. This page shows where your idea starts.

![Five steps from the bottom up, each with its folder and its language, and beside each step what one value
looks like there. A source, a simulator under source/ or an adapter of your own, publishes one value to the
broker over MQTT as contracts/mqtt says: "Executing". The .NET services under source/ store every value with
its time and serve them over REST as contracts/openapi says. A tool in apps/genui-mcp refines the stored values
into an answer: Running since 08:39, for 3 h 12 min. It is called over MCP as contracts/mcp says. A card of
packages/cards draws the answer. A page in apps/app imports the card and shows it, on a page or in the chat. A
page starts at the top step, a card at the two steps of the answer and the card, a source at the bottom step.
An agent can read the stored values over MCP, with nothing to build.](images/build-your-own/ladder.svg)

A value travels up, and at each step it has another form. A source publishes it: one value, as it happens. The
stack stores it: every value with its time. A tool refines the stored values into an answer: what a machine
does, since when, for how long. A card draws the answer, and a page shows the card. The step in the middle is
the one that makes the rest simple: numbers, order and durations are computed there, never by a language
model.

Your idea starts at one of three places. A card starts at two steps at once, the answer and the card that
draws it. What starts lower needs the steps above it too: a source is seen once a card shows it.

The picture is also the map of the repository. Each step names its folder and its language: the three upper
steps are TypeScript under `apps/` and `packages/`, the two lower ones are .NET under `source/`. Between two
steps stands how they talk, and for three of the four the contract under `contracts/` that says how. Whoever
keeps a contract can replace the step behind it, so the people who work on one step need not know the inside
of the next. Not in
the picture: `compose.yaml` starts every step as a container, and `stacks/` configures the broker. The whole
list is in the [repository layout](../README.md#repository-layout), and who looks after which area in
[MAINTAINERS.md](../MAINTAINERS.md). Who calls whom is drawn at the end, in
[The stack in detail](#the-stack-in-detail).

| Your idea | You build | You touch |
|---|---|---|
| A screen people open, made of answers that exist | [A page](#a-page) | `apps/app` |
| An answer that does not exist yet, to data that does | [A card](#a-card) | `packages/cards`, `apps/genui-mcp`, `apps/app` |
| Data the stack does not have yet | [A source](#a-source) | `contracts/mqtt`, a service of your own, `compose.yaml` |
| The data in an agent you already use | Nothing: [connect it](#with-an-agent-of-your-own) | the settings of your agent |

## Start with one sentence

With Claude Code in this repository, type `/build-your-own` and say what you would like to see or know. The
agent checks that your stack runs, asks at most one question, looks what the stack already has, and proposes
the smallest thing that shows it. On your yes it builds on a branch of your own with the recipe that fits,
checks its work and shows you the result. Nothing leaves your computer unless you ask for it.

The recipes are skills, one file each. Claude Code loads them by itself. Any other agent can read them: tell
it to follow `.claude/skills/build-your-own/SKILL.md`.

| Skill | What it does |
|---|---|
| [`build-your-own`](../.claude/skills/build-your-own/SKILL.md) | Asks for the goal, finds the step where the idea starts, and takes the recipe of that step |
| [`create-page`](../.claude/skills/create-page/SKILL.md) | A page in the example app, from answers that exist |
| [`create-card`](../.claude/skills/create-card/SKILL.md) | A tool that computes an answer, and the card that draws it |
| [`add-source`](../.claude/skills/add-source/SKILL.md) | An adapter that brings new values into the stack |

Each recipe names the files it touches and the checks that say it is done. Before it writes code it loads the
skills of the libraries, in the versions this repository pins: shadcn/ui for the user interface, TanStack for
routes, server functions and tools.

## A page

A screen people open, made of answers that exist. The example: the open warnings of all machines. The
generative UI backend knows them already, so the page only asks and draws.

**It touches** `apps/app`: one route and one line in the sidebar.

**Done when** the page opens in the running stack and shows the warnings Home shows.

The steps: [`create-page`](../.claude/skills/create-page/SKILL.md). More about the app:
[`apps/app`: What is where](../apps/app/README.md#what-is-where).

## A card

An answer that does not exist yet, to data that does. The example: the alarms of one machine over the last
eight hours. The Events API has them; no tool answers that question yet.

**It touches** `packages/cards` for the contract and the component, `apps/genui-mcp` for the tool, `apps/app`
for the place that draws it, and a row in [`contracts/mcp`](../contracts/mcp/README.md).

Three rules keep a card honest. Numbers, order and durations are computed in the tool, never by a language
model. Every value names the topic or the notification it comes from. What a model reads is short.

**Done when** the chat answers "Which alarms did P-04 raise today?" with the card.

The steps: [`create-card`](../.claude/skills/create-card/SKILL.md), which follows
[A new card](../packages/cards/README.md#a-new-card).

## A source

Data the stack does not have yet. The example: the outside temperature.

> The topics for a value that belongs to a place are proposed in
> [issue 60](https://github.com/united-machining-solutions/Pleiades.Playground/issues/60) and not agreed yet.
> Until they are, a source for such a value is built on a branch of your own, with the topic as proposed.

Bring a source in at the bottom, like a machine: an adapter that publishes to the broker. Then the value is
stored, every tool, card and agent can read it, and it can be traced to where it came from. A value that a
card, a tool or the app fetches for itself is none of that.

**It touches** an issue, [`contracts/mqtt`](../contracts/mqtt/README.md), a folder with your adapter, and
`compose.yaml`. A source is the one recipe that changes what everyone shares, so the topic is agreed before
the adapter is merged.

**Done when** the Timeseries API lists the new topic, every container is healthy, and a card shows the value
with its source.

The steps: [`add-source`](../.claude/skills/add-source/SKILL.md). It drafts the issue for you.

## With an agent of your own

Nothing to build. Three parts of the stack are MCP servers, and any MCP client can use them. The entry to copy
is in [`contracts/mcp`](../contracts/mcp/README.md).

| MCP server | Gives an agent | Address |
|---|---|---|
| Timeseries API | the stored values of a topic, as they are | `http://localhost:5500/mcp` |
| Events API | the notifications, with when they came and when they went | `http://localhost:5510/mcp` |
| Generative UI backend | answers: computed, in words, with a card | `http://localhost:5520/mcp` |

The two APIs offer over MCP the same queries as over REST. Use them to look at data before a tool answers for
it: a new source can be read there as soon as it is stored. The chat of the example app connects only to the
generative UI backend, so its language model reads answers and not raw values.

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

## The stack in detail

![Three rows, and every arrow points from the caller to the one it calls. At the top, where a person asks: the
example app with its pages, its chat and the language model the chat asks, and beside it another host, such as
Claude Desktop, ChatGPT or an editor, that brings a model of its own. In the middle three MCP servers side by
side: the generative UI backend, the Timeseries API and the Events API. The example app calls the generative UI
backend only. Another host can call the generative UI backend for answers and cards, and the two APIs for raw
values. The generative UI backend reads the two APIs over REST. At the bottom, the way in: the simulators or an
adapter of your own publish to the MQTT broker, the persistence subscribes to it and writes to the APIs over
REST.](images/build-your-own/stack.svg)

Who calls whom. Every arrow points from the caller to the one it calls. What is drawn solid is in this
repository; what is dashed is outside it, or yours.

- **The example app** is one host. Its pages call the tools of the generative UI backend and draw the cards.
  Its chat sends the question to a language model and calls the tool the model picks. The model is a setting
  of the chat ([Which model answers](#which-model-answers)); it calls nothing itself.
- **Another host** takes the place of the example app: Claude Desktop, ChatGPT, an editor, any MCP client. It
  brings a model of its own, and it shows a card if it supports MCP Apps. A host that runs elsewhere, as
  ChatGPT does, cannot reach `localhost`: it needs an address of the stack that it can reach.
- **Three MCP servers** answer. The generative UI backend gives answers: computed, in words, with a card. It
  reads the two APIs over REST. The two APIs give the stored values as they are. The example app connects to
  the generative UI backend only; another host can connect to all three
  ([With an agent of your own](#with-an-agent-of-your-own)).
- **The way in**: a simulator or an adapter of your own publishes to the broker. The persistence subscribes
  to the broker and writes every value to the APIs.

## A card and its server

![On the left a host, the example app or any other, with a card in it. On the right two MCP servers, one above
the other: the generative UI backend, whose tool answered, and any other MCP server, such as the Timeseries API
or the Events API. The host calls a tool of the generative UI backend, and the answer brings the card. The card
asks for more only at that server. Between the card and the other MCP server stands a sign: no call to another
server. The generative UI backend reads the other server itself.](images/build-your-own/card.svg)

**A card comes from the server whose tool answered, and it calls only that server.** For the tools that are
meant for a card, the standard is strict: "Cross-server tool calls are always blocked for app-only tools"
([MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)).
So a card does not fetch from the data APIs, or from any other MCP server, by itself. What it needs beyond its
values it asks its own server for, the way the machine card asks for the spans of its band. What it needs from
another source, its own server reads.
