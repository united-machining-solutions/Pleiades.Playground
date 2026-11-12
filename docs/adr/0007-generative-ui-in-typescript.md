---
title: "Generative UI in TypeScript: a backend for displays, a card catalogue and the harness in the example app"
status: proposed
date: 2026-11-12
---

# ADR-0007: Generative UI in TypeScript

## Context

The demo case shows what machines do, on a page and in a chat with a language model. A model is good at
picking a tool and at a sentence about its result. It is not good at numbers, order and durations, and it
reads everything a tool returns. The same display should also appear in hosts this repository does not
build: a desktop app, another chat. The decisions below were taken while the TypeScript part was built and
stood in its READMEs; this record gathers them.

## Decision

- **Three parts.** `apps/genui-mcp` is an MCP server whose tools return what a display needs: every number
  is computed there, and every value names the topic or the notification it comes from. `packages/cards`
  is the card catalogue: for each card its contract (zod) and its React component. `apps/app` is the
  example application.
- **The stack.** TanStack Start for the application, shadcn/ui on Base UI for its components, TanStack AI
  for the MCP server and for the chat. Two parts are not stable: the TanStack AI harness is experimental
  and Nitro is a release candidate. Every version is pinned in the catalog of `pnpm-workspace.yaml`.
- **The agentic layer is the harness in the example app** (`apps/app/src/chat`). It runs on the server of
  the app, so the keys of the language models never reach a browser. Any other MCP client can take its
  place: the tools do not know who calls them.
- **Three blocks of language models**, each optional: OpenAI, Anthropic, and any endpoint that speaks
  OpenAI's chat completions. A chat picks among the models that are named. Without a model the chat says so
  and everything else works.
- **A card is one component in two wrappers.** The example app imports it. Every other host gets it as one
  HTML file, an MCP App, which the tool of the card links (`ui://genui/machine`).
- **What a model reads is short, and a series is fetched by the card itself.** The text of a result says in
  words what the display shows. Its values are for the display. What grows with time, the spans of a band,
  is a tool of its own that only a card calls.
- **Two transports.** Streamable HTTP in the stack, and stdin and stdout (`--stdio`) for a desktop host that
  starts the server as a process.
- **The server has no build step.** Node.js runs its TypeScript files as they are. Only the card files are
  built.

## Consequences

- A release of the harness or of Nitro can change an API. An update of those two is a change to review, not
  a routine bump.
- The output of a tool is the contract of a card. A change to a card starts in `packages/cards`.
- Hosts differ in what they hand a model: the text of a result, or its values. Both stay short, so a new
  value that grows with time needs a tool of its own.
- Node.js runs TypeScript only outside `node_modules`, so the image of the backend keeps the layout of the
  workspace.
- A card file carries everything it needs, about 580 kB, and loads nothing. It shows what the result says
  and does not refresh.

## Alternatives considered

- A harness as a service of its own: nothing but the example app would use it yet, and it would need the
  keys and a sign-in of its own.
- An application without a server: the keys of the language models would live in the browser.
- The card only as an MCP App: the example app would draw its own pages in a sandboxed frame. Only as a
  component: no other host could show it.
- The series in the result of the tool: simpler, but a model then reads the whole history of a machine as
  raw data, about twenty times as much text.
- A compiled server: one more step and one more output to keep in step, for nothing the runtime needs.
