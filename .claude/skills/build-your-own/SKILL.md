---
name: build-your-own
description: Start here when a person wants to build something of their own on the demo stack and has an idea but not a plan - "I want to see ...", "can we show ...", "I have an idea", "where do I start". Asks one question about the goal, checks what the stack already has, proposes the smallest thing that shows it, and builds it with the recipe that fits - a page, a card or a source of data.
---

# Build your own

A person has an idea for the demo stack. Find out what they want to see, find out what is already there, and
build the smallest thing that shows it. The person may not be a developer. They decide what is built. You
decide how, by the rules of this repository ([AGENTS.md](../../../AGENTS.md)).

The map is [docs/build-your-own.md](../../../docs/build-your-own.md): a value travels up five steps, and an
idea starts at the lowest step that is missing.

## How you talk

- Plain words, in the language of the person. Short sentences.
- One question at a time. Do not ask what you can look up.
- Ask about the goal, never about the build. No "page or card?", no "which route?". The words MCP, tool,
  route, contract, schema and topic stay out of your questions. Use them only if the person does.
- Say in one sentence what you are about to do, before you do it.

## 1. Check the ground

Look, without asking, and fix one thing at a time. Ask before you start or install anything.

| Check | How | If it fails |
|---|---|---|
| The stack runs | `docker compose ps`: every service is healthy | Ask, then `docker compose up -d --build --wait`. If Docker is missing or not started, say so and stop. |
| The tools for TypeScript are there | `node --version` is the version of `.nvmrc`, `pnpm --version` answers | Point to the [development setup](../../../docs/development-setup.md): Node.js, then `corepack enable pnpm`. |
| The packages are installed | `node_modules/` is there | Ask, then `pnpm install`. |
| Where the work goes | `git branch --show-current` | Nothing yet. You make a branch in step 5. |

`.env` is optional: the demo needs no secret. Only the chat needs the key of a language model. If the idea is
about the chat, check that the file is there. Never open it, never print it, never ask for a key: the person
sets it, see "Which model answers" in the map.

If a check fails and you cannot fix it, stop. Say in one sentence what is missing and what to ask a helper
for. Do not work around it.

## 2. Ask the one question

> What would you like to see or know at the end? Say it the way you would say it to a colleague, for
> example: "Which machine stood still the longest yesterday?"

Skip the question if the person has said it already. If the answer names a solution ("a dashboard", "a
chart"), ask once what they want to learn from it. Then stop asking.

## 3. Look for yourself

Go down the steps of the map and stop at the first one that is missing.

1. **Is it shown already?** The pages are the files under `apps/app/src/routes/`. The chat answers with
   every tool of the generative UI backend.
2. **Is there an answer?** The tools are listed in [`apps/genui-mcp`](../../../apps/genui-mcp/README.md#tools),
   the cards in [`packages/cards`](../../../packages/cards/README.md). The running backend lists its tools
   itself:

   ```bash
   curl -fsS -X POST http://localhost:5520/mcp \
     -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

3. **Is the data there?** The values the stack has stored: `GET http://localhost:5500/topics` with
   `startTime` and `stopTime` in ISO 8601, UTC, for the last ten minutes. The notifications: the Events API,
   <http://localhost:5510/>. What a machine publishes is listed in
   [`contracts/mqtt`](../../../contracts/mqtt/README.md).

| You found | Then | Recipe |
|---|---|---|
| A page or the chat shows it | Nothing to build. Name the address to open, or the question to ask the chat. | none |
| An answer exists, and no place shows it | A page | `create-page` |
| The data is there, and nothing answers the question | A card, with the tool that answers | `create-card` |
| The data is not in the stack | A source, then a card that shows it | `add-source` |

## 4. Say it back and wait

One or two sentences: what you found, what you will build, where it will appear. For example:

> The stack knows every warning, but no page lists them. I would add a page "Warnings" to the example app
> that lists the open warnings of all machines, newest first. Shall I?

Propose the smallest version: one question answered, with what the stack has today. Leave out filters,
settings and a second view, and say that they can come next. Then wait for a yes. If the person changes the
idea, go back to step 3.

## 5. Build it

1. Make a branch, unless the person is on one of their own: `git switch -c feat/<short-name>`. Never work on
   `main`.
2. Follow the recipe: the skill `create-page`, `create-card` or `add-source`, each a `SKILL.md` in a folder
   next to this one. After `add-source`, go on with `create-card`: a source is seen once a card shows it.
3. Touch only what the recipe names. If the idea needs more, stop and say what, and why.

## 6. Show it and hand over

- Show the result where the person can see it: the address to open, or the question to ask the chat.
- Say in plain words what you built, which files are new or changed, and what you checked. Say what you
  could not check.
- Offer to keep it: "Shall I save this as a commit on your branch?" Commit only on a yes, signed off
  (`git commit -s`), with a `Co-Authored-By` trailer that names you.
- Nothing leaves this computer unless the person asks for it. To share the work, the way is a pull request:
  [CONTRIBUTING.md](../../../CONTRIBUTING.md).

## What stays as it is

Without the person's yes, and the step the rules ask for, you change none of these:

- `source/`: the .NET services. A new source is a folder of its own, never a change to a service that is
  there.
- `contracts/`: an agreed interface changes with an issue first.
- `compose.yaml`, `stacks/`, `.github/`: shared by everyone.
- Anything the idea does not need. No tidying up on the way.
