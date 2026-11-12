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
- Do not ask about details. Put what you assumed into your proposal, so that the person can correct it.
- Say in one sentence what you are about to do, before you do it.

## 1. See that the stack runs

`docker compose ps -a`: every service is healthy. If not, ask, then `docker compose up -d --build --wait`. If
Docker is missing or not started, say so and stop: nothing here works without it.

Nothing else is needed to look and to talk. What it takes to build, you check in step 5.

## 2. Ask the one question

> What would you like to see or know at the end? Say it the way you would say it to a colleague, for
> example: "Which machine stood still the longest yesterday?"

Skip the question if the person has said what they want to know. If they named a solution instead of a goal
("a dashboard", "a chart"), at the start or as their answer, ask once what it should tell them:

> What should it tell you? What would you look for on it first?

Then stop asking.

## 3. Look for yourself

One command shows what the stack has: the pages, the answers, the stored values, the notifications, and
whether the chat has a language model. It only reads, and it runs with any Node.js from version 18.

```bash
node .claude/skills/build-your-own/look.mjs
```

Without Node.js, read the same from the files: the routes under `apps/app/src/routes/`, the tools in
[`apps/genui-mcp`](../../../apps/genui-mcp/README.md#tools), the topics in
[`contracts/mqtt`](../../../contracts/mqtt/README.md).

To read one answer as it is, call its tool:

```bash
node .claude/skills/build-your-own/look.mjs call genui_machine_show machine=P-04
```

Then take the first row that is true, from the top:

| What is true | Then | Recipe |
|---|---|---|
| A page shows it, or a tool returns it as it is | Nothing to build | none |
| Tools return what is needed, and no place shows it together | A page | `create-page` |
| The stored values or the notifications hold it, and no tool returns it | A card, with the tool that answers | `create-card` |
| The stack does not have the data | A source, then a card that shows it | `add-source` |

Where the rows meet:

- "As it is" means that nothing is left to add up, compare or put in order. A language model must not do
  that, and a page must not either. If the answer needs it, it is a card.
- A tool counts for the chat only if the chat has a language model. The command above says whether it has.
- Read the limits of an answer that exists, for example how far back it looks. If the idea needs more than
  that, it is a card.

## 4. Say it back and wait

Short, two to four sentences: what you found, what you will build, where it will appear, and what you
assumed. For example:

> The stack knows the open warnings of every machine, but no page lists them: Home shows one per machine. I
> would add a page "Warnings" to the example app that lists them machine by machine. It shows the warnings
> of the last 24 hours that have not gone. Shall I?

- **The smallest version.** One question answered, with what the stack has today. Leave out filters,
  settings and a second view, and say that they can come next.
- **What it leaves out.** Say the limit that matters: how far back it looks, what is not counted. The
  machines of the demo are simulated: if their values cannot answer the question for real, say that too.
- **Nothing to build.** Give the answer itself if you have read it, and say where to see it: the address to
  open, or the question to ask the chat. Then ask whether that is what they were looking for.
- **A source.** It is the bigger build, so say more: the stack does not have the data, a new source needs the
  agreement of the maintainers before it can be merged, and you need to know where the values come from.
  `add-source` asks for the rest.

Then wait for a yes. If the person changes the idea, go back to step 3.

## 5. Build it

First see that this computer can build. Do not install anything without a yes.

| Check | How | If it fails |
|---|---|---|
| Node.js | `node --version` is the version of `.nvmrc` | Say which version is there and which is needed, and point to the [development setup](../../../docs/development-setup.md). Stop: the person or a helper installs it. |
| pnpm | Ask first, then `corepack enable pnpm` and `pnpm --version`. The first call downloads pnpm. | If it does not answer, stop and say so. Do not look for a way around it. |
| The packages | `node_modules/` is there | Ask, then `pnpm install`. |

When you stop here, say in one sentence what is missing and what to ask a helper for. The idea is not lost:
say that you will build it as proposed once the computer is ready.

Then:

1. Make a branch, unless the person is on one of their own: `git switch -c feat/<short-name>`. Never work on
   `main`.
2. Follow the recipe: the skill `create-page`, `create-card` or `add-source`, each a `SKILL.md` in a folder
   next to this one. After `add-source`, go on with `create-card`: a source is seen once a card shows it.
3. Touch only what the recipe names. If the idea needs more, stop and say what, and why.

`.env` is not needed to build: the demo needs no secret. Only the chat needs the key of a language model.
Never open the file, never print it, never ask for a key: the person sets it, see "Which model answers" in
the map.

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
