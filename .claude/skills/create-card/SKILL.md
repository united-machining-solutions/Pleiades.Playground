---
name: create-card
description: Adds an answer that does not exist yet to the stack - a tool of the generative UI backend that computes it from stored values, and the card that draws it in the chat, on a page and in other hosts. Use for a new card, a new tool of genui-mcp, a new figure or chart over machine data, or when build-your-own found that the data is there and nothing answers the question.
---

# Create a card

A card is an answer and its drawing. A tool of the generative UI backend reads the stored values and refines
them into an answer; a card of the catalogue draws that answer. The two are built together, by
[A new card](../../../packages/cards/README.md#a-new-card). This skill adds the order, the rules and the
checks.

If the data is not in the stack, this is the wrong recipe: take `add-source` first.

The example of [the map](../../../docs/build-your-own.md#a-card): the alarms of one machine over the last
eight hours.

## Before you write code

1. Read [`packages/cards`](../../../packages/cards/README.md) whole, and in
   [`apps/genui-mcp`](../../../apps/genui-mcp/README.md) the sections "A result is an answer" and "What is
   where".
2. Read the machine card as the example to follow: its contract and component under
   `packages/cards/src/machine/`, its tool in `apps/genui-mcp/src/server.ts`, what computes it in
   `apps/genui-mcp/src/machines.ts` and `history.ts`, and its tests.
3. Load the skills of the libraries, in the versions this repository pins:

   ```bash
   pnpm exec intent load @tanstack/ai-mcp#ai-mcp
   pnpm exec intent load @tanstack/ai#ai-core/tool-calling
   ```

   The first is for the tool, the second for how a chat draws the result of a tool.
4. The skill `shadcn` (`.claude/skills/shadcn/`), and the docs of every component before you use it:
   `pnpm --filter @pleiades/app exec shadcn docs <name>`.

No library skill covers the agent harness of the chat. What you need of it is in
[`apps/app`: What is where](../../../apps/app/README.md#what-is-where), under `src/chat/`: which file gives
the language model its tools, and which file says what the app draws for which tool.

## The rules of a card

- Numbers, order and durations are computed in the tool. Never by a language model, and never in the
  component: it computes nothing but wording.
- Every value names the topic or the notification it comes from.
- What a language model reads is short: a few lines of text, a few values. A series, anything that grows with
  time or with the number of things, gets a contract and a tool of its own, which only the card calls and
  the language model is not offered. The band of the machine card is the example.
- A card calls only the server it came from
  ([A card and its server](../../../docs/build-your-own.md#a-card-and-its-server)). What it needs from
  another source, its tool reads.

## You touch

- `packages/cards/src/<name>/`: a new folder with the contract, the component and their tests, and a row in
  the table of `packages/cards/README.md`.
- `apps/genui-mcp/src/`: the tool in `server.ts`, what computes it in a file of its own with tests, and a
  row in the table of `apps/genui-mcp/README.md`.
- `contracts/mcp/README.md`: the name of the tool. A contract changes with an issue first: on your own branch
  add the row, and say in your hand-over that the pull request needs the issue.
- `apps/app/src/chat/`: the file that says what the app draws for which tool.
- `apps/genui-mcp/ui/`: the card file for other hosts, and its entry in the build there.

Not the two APIs, not `source/`, not a card that is there. A page that shows the card all the time is the
next recipe, `create-page`.

## Steps

1. Name the tool `genui_<subject>_<action>`, in lower case with underscores.
2. Write the contract, a zod schema, in the new folder: the values of the answer, each with its source.
3. Add the tool with that contract as its output. It reads the two APIs over REST through
   `apps/genui-mcp/src/apis.ts`, computes, and returns two things: a few lines of text for a language model,
   and the values for the card. Test what it computes with fixed values, as the tests next to it do.
4. Write the component with the inferred type of the contract as its properties. Build it from the shadcn/ui
   components under `packages/cards/src/ui/`; add a missing one with `shadcn add`. Use the composition of
   its docs whole.
5. In the app, draw the component where the result of the tool arrives. The chat then shows the card as soon
   as the language model calls the tool.
6. Add the card file for other hosts. If you leave it out, say so: the card then shows in the example app
   only.

## Done when

Run the checks. Do not assume them.

- `pnpm typecheck && pnpm test && pnpm build` pass.
- The stack runs with it: `docker compose up -d --build --wait genui-mcp app`.
- You have called the tool and read its result:

  ```bash
  curl -fsS -X POST http://localhost:5520/mcp \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{}}}'
  ```

  The text says the answer in words, and one number of it is right against the stored values: check it by
  hand in the Swagger UI of the API it comes from.
- The chat answers the question with the card. That needs a language model. Without one, say so, and show
  the card by the call above or on a page.
- The diff holds only what is under "You touch".
