---
name: setup
description: Gets a computer ready for the demo stack, step by step, with a person who may never have done this - checks Docker, starts the stack, checks Node.js and pnpm, installs the packages, and helps to give the chat a language model. Use when a person has just got the repository, says "set me up", "get me started", "is my computer ready", or when the stack, the example app or the chat does not run.
---

# Set up

A person wants to work with the demo stack on their computer. They may never have used a terminal. You check,
you explain, and you do what you are allowed to; they say yes and click. By the end they know what their
computer is ready for, and for everything that is missing they hold one sentence they can pass on.

## How you talk

- Plain words, in the language of the person. Short sentences. No word they would have to look up: say "the
  program that runs the demo" before you say Docker, once.
- One step at a time. After every check, say in one sentence what you found, also when it is good news.
- Ask before you start, install or download anything, and say how long it takes. While something runs for
  minutes, say every minute or two that it is still at it.
- Never open `.env`, never print it, never ask for a key.
- Do not look for a way around a step that fails. Stop that level, and give the sentence to pass on.
- A sentence to pass on is for the IT of the person or for a helper. Give it in the language of the person,
  on a line of its own, so that they can copy it.

## Three levels

A computer does not have to reach all three. Each level stands for something the person can do.

| Level | The person can | It needs |
|---|---|---|
| 1. See the demo | open the example app and take the tour | Docker, and the stack started |
| 2. Build | add a page, a card or a source of their own with `build-your-own` | Node.js, pnpm and the packages |
| 3. Chat | get answers in the chat of the example app | level 1, and the key of a language model |

Go through them in this order. A level ends in one of three ways: ready, not ready with what is missing, or
not checked yet with the reason. Level 2 does not wait for level 1. Level 3 does.

## Level 1: see the demo

1. **Is Docker there?** `docker version`.
   - The command is not known: Docker is not installed. Installing it needs administrator rights, so it is
     for the person's IT or a helper, who finds the steps in the
     [development setup](../../../docs/development-setup.md). The sentence to pass on: "Please install Docker
     Desktop on my computer. It needs administrator rights, and on Windows it needs WSL 2."
   - It names a client and then says that it cannot reach the engine: Docker is installed and not running.
     Ask the person to start Docker Desktop themselves, from the Start menu on Windows or from the
     Applications folder on a Mac, and to say when its window shows that it runs. Do not start it from here:
     a Docker that is started from this app ends when this app is closed. When `docker version` names a
     server too, say that it runs.
2. **Does the stack run already?** `docker compose ps -a`. If every service is healthy, say so and go to the
   check.
3. **Start the stack.** Say first that the first start downloads and builds for ten minutes or more. On a
   yes: `docker compose up -d --build --wait`.
   - It fails with words like "certificate", "x509" or "unable to get local issuer certificate": the network
     of the company looks into the connections, and Docker does not trust it. The sentence to pass on, with
     the host that the error names put first: "Docker on my computer cannot download from <host>. It needs
     docker.io, mcr.microsoft.com, registry.npmjs.org and nuget.org. Please allow these hosts for Docker, or
     give Docker the root certificate of our network."
   - A port is in use, or one container stays unhealthy: "Known issues" in the development setup says what
     to do. Tell the person what it says, in their words.
   - It dies once with "EOF" while building: start it once more.
4. **Check.** `docker compose ps -a`: every service is healthy. Then name the address to open:
   <http://localhost:5600/>. Offer the tour: "Shall I give you a tour of the demo?"

## Level 2: build

1. **Node.js.** `node --version` is the version of `.nvmrc`. If it is missing or older, installing it is for
   the person's IT or a helper. The sentence to pass on: "Please install Node.js in version 26 on my
   computer." Then pnpm and the packages wait for it: say so, and do not check them.
2. **pnpm.** Ask first: the first call may download it. Then `pnpm --version` answers with the version that
   `package.json` names. If the command is missing: `npm install --global corepack`, then
   `corepack enable pnpm`. Node.js no longer brings Corepack from version 25. If the person does not want a
   download now, the level is not checked yet.
3. **The packages.** Ask, then `pnpm install`. It takes a few minutes. A failure with "certificate" in it is
   the same as in level 1, for registry.npmjs.org.
4. **Check.** `pnpm exec intent list` names the skills of the libraries. Then the person can start with
   `build-your-own`.

## Level 3: chat

The chat of the example app needs the key of a language model. Everything else works without one. If level 1
is not ready, this level is not checked yet.

1. **Is one set?** `node .claude/skills/build-your-own/look.mjs` says under "Chat" whether the chat answers.
   It runs with any Node.js from version 18. Without Node.js, ask the person to open the example app and its
   chat: the panel says itself when no language model is set. Do not look for the key in a file.
2. **If none is set:** follow "When the chat has no language model" in the skill `build-your-own`
   (`.claude/skills/build-your-own/SKILL.md`). The person fills in the key themselves.

## Say where it stands

End with a short list, one line for each level: ready, or not ready with what is missing, or not checked yet
with the reason. Below it, the sentences to pass on, each on a line of its own. Then say what the person can
do now:

- Level 1 is ready: take the tour, or look around the example app.
- Level 2 is ready: say what they would like to see, and `build-your-own` takes it from there.
- Nothing is ready yet: that is fine. Tell them what to ask for, and that the same check takes a minute once
  it is done.

## When something stops working later

Go through the same checks in the same order. Start with Docker: if the example app, the chat or a tool of
the stack is gone, the first thing to look at is whether Docker still runs.
