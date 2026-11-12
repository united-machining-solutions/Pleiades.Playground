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
Docker is missing or not started, the skill `setup` leads the person through it: nothing here works without
it.

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
  If it has none and the idea needs the chat, say so in step 4, and offer the steps under "When the chat has
  no language model".
- Read the limits of an answer that exists, for example how far back it looks. If the idea needs more than
  that, it is a card.

## 4. Say it back and wait

First read the recipe you are about to take, at least its rules and what it touches. A proposal the recipe
does not allow costs the person a second question.

Then say it, short, in two to four sentences: what you found, what you will build, where it will appear, and
what you assumed. For example:

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
  agreement of the maintainers before it can be merged, and you need to know where the values come from. On
  the person's own branch it can run and be shown before they answer. Name what it changes for everyone, so
  that the yes covers it: an entry in `compose.yaml`. `add-source` asks for the rest.

Then wait for a yes. If the person changes the idea, go back to step 3.

## 5. Build it

First see that this computer can build. Do not install anything without a yes. These three are for
TypeScript, which a page and a card are written in; a source in another language needs the tools of that
language instead.

| Check | How | If it fails |
|---|---|---|
| Node.js | `node --version` is the version of `.nvmrc` | Say which version is there and which is needed, and point to the [development setup](../../../docs/development-setup.md). Stop: the person or a helper installs it. |
| pnpm | Ask first, then `pnpm --version`: it answers with the version `package.json` names. The first call may download pnpm. | If the command is missing: `npm install --global corepack`, then `corepack enable pnpm`. Node.js no longer brings Corepack from version 25. If pnpm still does not answer, stop and say so. |
| The packages | `node_modules/` is there | Ask, then `pnpm install`. |

When you stop here, say in one sentence what is missing and what to ask a helper for. The skill `setup` has
the steps and the sentences to pass on. The idea is not lost: say that you will build it as proposed once
the computer is ready.

Then:

1. Make a branch, unless the person is on one of their own: `git switch -c feat/<short-name>`. Never work on
   `main`.
2. Follow the recipe: the skill `create-page`, `create-card` or `add-source`, each a `SKILL.md` in a folder
   next to this one. After `add-source`, go on with `create-card`: a source is seen once a card shows it.
3. Build what you proposed, and touch only what the recipe names. A good idea on the way is a sentence in
   your hand-over, not a change. If the idea needs more than the recipe allows, stop and say what, and why.

`.env` is not needed to build: the demo needs no secret. Only the chat needs the key of a language model.
Never open the file, never print it, never ask for a key: the person sets it, the way the section "When the
chat has no language model" says.

## 6. Show it and hand over

- Show the result where the person can see it: the address to open, or the question to ask the chat.
- Say in plain words what you built, which files are new or changed, and what you checked. Say what you
  could not check.
- Offer to keep it: "Shall I save this as a commit on your branch?" Commit only on a yes, signed off
  (`git commit -s`), with a `Co-Authored-By` trailer that names you.
- Nothing leaves this computer unless the person asks for it. To share the work, the way is a pull request:
  [CONTRIBUTING.md](../../../CONTRIBUTING.md).

## When the chat has no language model

The look-up says whether it has one. Pages and cards work without it; only an answer in the chat needs it.
The key belongs to the person or to their company, and you never see it.

1. See whether `.env` is there, without opening it. If it is not, ask, then copy `.env.example` to `.env`.
   If it is, leave it as it is.
2. Ask the person to open `.env` in an editor and to fill in one block themselves: the key, and the name of
   a model where the line is empty. There is a block for OpenAI, one for Anthropic, and one for any other
   endpoint, a model on their own computer included. What goes where:
   [Language models](../../../apps/app/README.md#language-models). Tell them to keep the key out of this
   conversation. A subscription to a chat product, Claude or ChatGPT, is not such a key: the key comes from
   the API console of the provider and is billed there.
3. When they say it is done, start the app again, `docker compose up -d app`, and look again: the look-up
   says whether the chat answers now.

If the person has no key, say what works without one, and go on with that.

## What stays as it is

Without the person's yes, and the step the rules ask for, you change none of these:

- `source/`: the .NET services. A new source is a folder of its own, never a change to a service that is
  there.
- `contracts/`: an agreed interface changes with an issue first.
- `compose.yaml`, `stacks/`, `.github/`: shared by everyone.
- Anything the idea does not need. No tidying up on the way.
