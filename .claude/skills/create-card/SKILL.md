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

The example: the alarms of one machine over the last eight hours, each alarm once: how often it was raised,
for how long in total, and when last. The Events API has every one of them, and no tool sums them up.

## Before you write code

1. Read [`packages/cards`](../../../packages/cards/README.md) whole, and in
   [`apps/genui-mcp`](../../../apps/genui-mcp/README.md) the sections "A result is an answer" and "What is
   where".
2. Read the machine card as the example to follow: its contract and component under
   `packages/cards/src/machine/`, its tools in `apps/genui-mcp/src/cards/machine.ts`, what computes them in
   `apps/genui-mcp/src/machines.ts` and `history.ts`, what the chat draws for them in
   `apps/app/src/machines/chat.tsx`, and the tests.
3. Load the skills of the libraries, in the versions this repository pins:

   ```bash
   pnpm exec intent load @tanstack/ai-mcp#ai-mcp
   pnpm exec intent load @tanstack/ai#ai-core/tool-calling
   ```

   The first is for the tool, the second for how a chat draws the result of a tool.
4. The skill `shadcn` (`.claude/skills/shadcn/`), and the docs of every component before you use it:
   `pnpm --filter @pleiades/app exec shadcn docs <name>`. The command names the page of the docs: read that
   page. Use the CLI this workspace pins, as here, also where the skill of shadcn/ui writes `shadcn@latest`.

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
- `apps/genui-mcp/src/cards/<name>.ts`: new, the card in the backend: its tools, a line about each for the
  description of the server, its sections of the guide, and its card file. What computes the answer goes into
  a file of its own under `src/`, with tests. One more reader in `apis.ts`, if the tool needs a query of the
  two APIs that is not there, checked like the ones there. And a row in the table of
  `apps/genui-mcp/README.md`.
- `apps/genui-mcp/src/cards/index.ts`: one line for the card, in the order of the alphabet. The server, its
  description and its guide take the card from there: touch neither `server.ts` nor `guide.ts`.
- `contracts/mcp/README.md`: the name of the tool. A contract changes with an issue first: on your own branch
  add the row, and say in your hand-over that the pull request needs the issue.
- `apps/app/src/<name>/chat.tsx`: new, the card in the chat: what a call of each of its tools is called, what
  the chat draws for a result, and which tool only a card calls. Next to it, as in `src/machines/`: what
  checks a result against the contract, with tests, and a server function if the card fetches a series with a
  tool of its own.
- `apps/app/src/chat/cards.tsx`: one line for the card, in the order of the alphabet. The chat and its
  server take the card from there: touch neither `chat-sidebar.tsx` nor `blocks.ts`.
- `packages/cards/src/ui/`: a shadcn/ui component the card needs and the catalogue does not have yet.
- `apps/genui-mcp/ui/<name>.html` and `<name>.tsx`: new, the card file for other hosts. The build finds the
  page by itself.

The two lists are the only files you share with somebody who adds another card at the same time. Keep to
one line in each, at its place in the alphabet.

Not the two APIs, not `source/`, not a card that is there. A page that shows the card all the time is the
next recipe, `create-page`.

## Steps

1. Name the tool `genui_<subject>_<action>`, in lower case with underscores.
2. Write the contract, a zod schema, in the new folder: the values of the answer, each with its source.
3. Add the tool with that contract as its output, in the module of the card. It reads the two APIs over
   REST through `apps/genui-mcp/src/apis.ts`, computes, and returns two things: a few lines of text for a
   language model, and the values for the card. Test what it computes with fixed values, as the tests next
   to it do.
4. Write the component with the inferred type of the contract as its properties. Build it from the shadcn/ui
   components under `packages/cards/src/ui/`. Add a missing one there, not into the app: `shadcn add` takes
   the folder with `--path`. Use the composition of its docs whole.
5. In the app, draw the component where the result of the tool arrives: in the `draw` of the tool, in the
   `chat.tsx` of the card. The chat then shows the card as soon as the language model calls the tool.
6. Add the card file for other hosts. If you leave it out, say so: the card then shows in the example app
   only.

## Done when

Run the checks. Do not assume them.

- `pnpm typecheck && pnpm test && pnpm build` pass.
- The stack runs with it: `docker compose up -d --build --wait --no-deps genui-mcp app`.
- You have called the tool and read its result:

  ```bash
  node .claude/skills/build-your-own/look.mjs call <tool> <key>=<value>
  ```

  The text says the answer in words, and one number of it is right against the stored values: check it by
  hand in the Swagger UI of the API it comes from.
- The chat answers the question with the card. That needs a language model. Without one, say so, and show
  the card by the call above or on a page.
- You have looked at the card: its values are those of the call above, nothing runs over, an empty answer
  says that it is empty. Every check before this one passes on text alone. Without a browser, say that nobody
  has seen the card.
- The diff holds only what is under "You touch".
