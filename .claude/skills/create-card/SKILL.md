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
   page. With `.md` at the end of its address it comes whole, with its examples. Use the CLI this workspace
   pins, as here, also where the skill of shadcn/ui writes `shadcn@latest`.

No library skill covers the agent harness of the chat. What you need of it is in
[`apps/app`: What is where](../../../apps/app/README.md#what-is-where), under `src/chat/`: which file gives
the language model its tools, and which file says what the app draws for which tool.

## The rules of a card

- Numbers, order and durations are computed in the tool. Never by a language model, and never in the
  component: it computes nothing but wording.
- Every value names the topic or the notification it comes from.
- What a language model reads is short: a few lines of text, a few values. A row for each of a few things
  is part of the answer: the machines, the kinds of alarm of one machine. A series is not: a value for every
  interval, anything that grows with the time it covers. It gets a contract and a tool of its own, which only
  the card calls and the language model is not offered. The band of the machine card is the example.
- A card calls only the server it came from
  ([A card and its server](../../../docs/build-your-own.md#a-card-and-its-server)). What it needs from
  another source, its tool reads.

## You touch

`<name>` is one word in lower case, the same in every place below. The machine card is `machine` everywhere
but in the app, where its folder `src/machines/` also holds the pieces of its pages.

- `packages/cards/src/<name>/`: a new folder with the contract, the component and their tests, and a row in
  the table of `packages/cards/README.md`.
- `apps/genui-mcp/src/cards/<name>.ts`: new, the card in the backend: its tools, a line about each for the
  description of the server, its sections of the guide, and its card file. One file is enough. The machine
  card has two more beside it because its guide is long (`machine.guide.ts`) and its card file calls a tool
  by name (`machine.names.ts`). What computes the answer goes into a file of its own under `src/`. A test
  stands beside the file it tests. One more reader at the end of `apis.ts`, if the tool needs a query of the
  two APIs that is not there, checked like the ones there. And a row in each table of
  `apps/genui-mcp/README.md` the card belongs in: its tools, and its card file under the resources.
- `apps/genui-mcp/src/cards/index.ts`: an import and one line for the card, in the order of the alphabet. The
  server, its description and its guide take the card from there: touch neither `server.ts` nor `guide.ts`.
- `contracts/mcp/README.md`: the name of the tool, in the row of the generative UI backend. A contract
  changes with an issue first: on your own branch add the name, and say in your hand-over that the pull
  request needs the issue.
- `apps/app/src/<name>/chat.tsx`: new, the card in the chat: what a call of each of its tools is called, what
  the chat draws for a result, and which tool only a card calls. Next to it, as in `src/machines/`: what
  checks a result against the contract, with tests, and a server function if the card fetches a series with a
  tool of its own.
- `apps/app/src/chat/cards.tsx`: an import and one line for the card, in the order of the alphabet. The chat
  and its server take the card from there: touch neither `chat-sidebar.tsx` nor `blocks.ts`.
- `packages/cards/src/styles.css`: one line for a shadcn/ui component the card draws and no card drew before.
  The components themselves live in `packages/ui`.
- `apps/genui-mcp/ui/<name>.html` and `<name>.tsx`: new, the card file for other hosts. The build finds the
  page by itself.

What you share with somebody who adds another card at the same time: the two lists, the tables of the two
READMEs, the row in `contracts/mcp/README.md`, the end of `apis.ts` and `packages/cards/src/styles.css`.
Keep to your own line or row in each, at its place in the alphabet where there is one. Where two cards meet
in the same line, whoever is merged second keeps both.

Not the two APIs, not `source/`, not a card that is there, and not `docs/tour.md`: say in your hand-over
that the tour does not show the card yet. A page that shows the card all the time is the next recipe,
`create-page`.

## Steps

1. Name the tool `genui_<subject>_<action>`, in lower case with underscores.
2. Write the contract, a zod schema, in the new folder: the values of the answer, each with its source.
3. Add the tool with that contract as its output, in the module of the card. It reads the two APIs over
   REST through `apps/genui-mcp/src/apis.ts`, computes, and returns two things: a few lines of text for a
   language model, and the values for the card. Test what it computes with fixed values, as the tests next
   to it do.

   Look at what an API really returns before you compute from it: in its Swagger UI (the Timeseries API at
   <http://localhost:5500/>, the Events API at <http://localhost:5510/>) or with a GET of your own. Two
   things the Events API does: a list ends after `Take` entries, 100 if omitted and 1000 at most, and says
   so with `hasMore`; and a pair of "raised" and "gone" can come without a duration, because the
   notification has not gone yet or because the window you asked for cut it. Decide what your figure does
   with these, and say it in the contract. Where another card shows the same thing, the two must not
   contradict each other.
4. Write the component with the inferred type of the contract as its properties. Build it from the shadcn/ui
   components of `packages/ui`, imported as `@pleiades/ui/components/<name>`. Add a missing one with
   `pnpm --filter @pleiades/app exec shadcn add <name>`, which writes it there. A component that no card drew
   before gets its line in `packages/cards/src/styles.css`, or a card file shows it without its styles: a
   test of the catalogue tells you. Use the composition of its docs whole.
5. In the app, draw the component where the result of the tool arrives: in the `draw` of the tool, in the
   `chat.tsx` of the card. The chat then shows the card as soon as the language model calls the tool.
6. Add the card file for other hosts: `apps/genui-mcp/ui/<name>.html` and `<name>.tsx`, after
   `ui/machine.html` and `ui/machine.tsx`. What connects a card file to its host is not shared yet: copy it
   from `ui/machine.tsx` (`useApp`, taking the font of the host, the note for an answer that is no card).
   Two names tie the file to the tool: `file: { name: "<name>", uri: "ui://genui/<name>" }` in the module of
   the card, and `_meta: { ui: { resourceUri } }` with the same address in the metadata of the tool that
   shows the card. If you leave the card file out, say so: the card then shows in the example app only, and
   nobody can look at it without a language model.

## Done when

Run the checks. Do not assume them.

- `pnpm typecheck && pnpm test && pnpm build` pass.
- The stack runs with it: `docker compose up -d --build --wait --no-deps genui-mcp app`.
- You have called the tool and read its result:

  ```bash
  node .claude/skills/build-your-own/look.mjs call <tool> <key>=<value>
  ```

  The text says the answer in words, and one number of it is right against the stored values: ask the API
  it comes from the same question yourself, in its Swagger UI or with a GET, and compare.
- The chat answers the question with the card. That needs a language model. Without one, say so.
- You have looked at the card. That needs no language model:

  ```bash
  node .claude/skills/build-your-own/show-card.mjs <tool> <key>=<value>
  ```

  It stands in for a host of MCP Apps: it serves one page with the card file and the result of the tool,
  wide and narrow, until it is stopped, so start it in the background. Open the address it prints, or take a
  picture of it. The values are those of the call above, nothing runs over, an empty answer says that it is
  empty, and a call the tool refuses shows the words of the tool. Every check before this one passes on text
  alone. Without a browser, say that nobody has seen the card.
- The card file is there: `pnpm build` wrote `apps/genui-mcp/dist/ui/<name>.html`, and `show-card.mjs`
  found it through the tool.
- `node .github/scripts/check-doc-links.mjs` passes.
- The diff holds only what is under "You touch".
