# Build your own

Add something of your own to the demo. With Claude Code in this repository, type `/build-your-own` and say
what you would like to see or know. The agent asks one question, looks what the stack already has, proposes
the smallest thing that shows it, and builds it on a branch of your own. The recipes are skills, and any
other agent can follow them too.

![Five steps from the bottom up, each with its folder and its language, and beside each step what one value
looks like there. A source, a simulator under source/ or an adapter of your own, publishes one value to the
broker over MQTT as contracts/mqtt says: "Executing". The .NET services under source/ store every value with
its time and serve them over REST as contracts/openapi says. A tool in apps/genui-mcp refines the stored values
into an answer: Running since 08:39, for 3 h 12 min. It is called over MCP as contracts/mcp says. A card of
packages/cards draws the answer. A page in apps/app imports the card and shows it, on a page or in the chat. A
page starts at the top step, a card at the two steps of the answer and the card, a source at the bottom step.
An agent can read the stored values over MCP, with nothing to build.](images/build-your-own/ladder.svg)

A value travels up, and at each step it has another form. Your idea starts at the lowest step that is
missing.

| Your idea | Recipe |
|---|---|
| You do not know yet where it starts | [`build-your-own`](../.claude/skills/build-your-own/SKILL.md) |
| A screen people open, made of answers that exist | [`create-page`](../.claude/skills/create-page/SKILL.md) |
| An answer that does not exist yet, to data that does | [`create-card`](../.claude/skills/create-card/SKILL.md) |
| Data the stack does not have yet | [`add-source`](../.claude/skills/add-source/SKILL.md) |
| The data in an agent you already use | Nothing to build: [`contracts/mcp`](../contracts/mcp/README.md) |

Which language model answers in the chat is a setting, also for a model on your own computer:
[`apps/app`: Language models](../apps/app/README.md#language-models).

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
  of the chat ([Language models](../apps/app/README.md#language-models)); it calls nothing itself.
- **Another host** takes the place of the example app: Claude Desktop, ChatGPT, an editor, any MCP client. It
  brings a model of its own, and it shows a card if it supports MCP Apps. A host that runs elsewhere, as
  ChatGPT does, cannot reach `localhost`: it needs an address of the stack that it can reach.
- **Three MCP servers** answer. The generative UI backend gives answers: computed, in words, with a card. It
  reads the two APIs over REST. The two APIs give the stored values as they are. The example app connects to
  the generative UI backend only; another host can connect to all three
  ([`contracts/mcp`](../contracts/mcp/README.md)).
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
