---
name: setup
description: Gets a computer ready for the demo stack, step by step, with a person who may never have done this - checks Docker, starts the stack, checks Node.js and pnpm, installs the packages, and helps to give the chat a language model. Use when a person has just got the repository, says "set me up", "get me started", "is my computer ready", or when the stack, the example app or the chat does not run.
---

# Set up

A person wants to work with the demo stack on their computer. They may never have used a terminal. You check,
you explain, and you do what you are allowed to; they say yes and click. By the end they know what their
computer is ready for, and for everything that is missing they hold one sentence they can pass on.

## How you talk

- Plain words, in the language of the person, and address them the way they address you. Short sentences.
  No word they would have to look up: say "the program that runs the demo" before you say Docker, once.
- One step at a time. After every check, say in one sentence what you found, also when it is good news.
- Ask before you start, install or download anything, and say how long it takes. While something runs for
  minutes, say every minute or two that it is still at it. If you cannot speak while it runs, say so before
  you start.
- Never open `.env`, never print it, never ask for a key. If the person offers one, say no: they put it in
  themselves, and it stays out of this conversation.
- Do not look for a way around a step that fails, also when the person asks for one or is in a hurry. Stop
  that level, and give the sentence to pass on.
- A sentence to pass on is for the IT of the person or for a helper. Give it in the language of the person,
  on a line of its own, so that they can copy it.
- Installing a program is for the IT of the person or for a helper. If the person says they can do it
  themselves, the steps are in the [development setup](../../../docs/development-setup.md).

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
     a Docker that is started from this app ends when this app is closed. When they say that it runs, run
     `docker version` again: it names a server too now. Say that it runs.
2. **Does the stack run already?** `docker compose ps -a`. If every service is healthy, say so and go to the
   check: steps 3 and 4 are for a stack that has to be started, and a stack that runs is ready, whichever
   images it runs. If it lists nothing, or a service is not healthy, go on with the next step.
3. **Which images does this computer take?** The demo starts from the published images of `main`: it
   downloads them and builds nothing. A person who wants to build the stack from its code instead: read
   the paragraph below step 5 now. Which images are taken is the setting `PLEIADES_VERSION` in `.env`.
   `.env.example` names `dev`, the images of somebody who builds, and without a `.env` it is `dev` too. So
   look first: `docker compose config --images` lists the images. Run it with `--images`, never without:
   without, it prints every setting, a key included.
   - The images named `pleiades.playground` end in `:main`: go on.
   - They end in something else, and there is no `.env`: ask, then make it. Copy `.env.example` to `.env`
     and set the line `PLEIADES_VERSION=main` in the copy. This is the one time you write that file: a
     fresh copy holds no key.
   - They end in something else, and `.env` is there: somebody made it, and it may hold a key. Do not open
     it. Ask the person to open it in an editor, to write `main` in the line that begins with
     `PLEIADES_VERSION=`, or to add the line `PLEIADES_VERSION=main` if there is none, and to save.

   After a change, list the images again: they end in `:main` now. If they do not, stop and say what you
   see. Before a start from the published images this step is never left out, and the version is never put
   in front of one command instead. A later start that finds another version in `.env` builds the whole
   stack: the start after the person has filled in a key, for example.
4. **Start the stack.** Say first that the first start downloads about half a gigabyte: a few minutes on a
   good connection, longer on a slow one. On a yes to the start: `docker compose up -d --no-build --wait`.
   It can run longer than most tools let a command run: start it in the background and wait for it to end,
   or it is cut off and looks like a failure.
   - It fails with words like "certificate", "x509" or "unable to get local issuer certificate": the network
     of the company looks into the connections, and Docker does not trust it. The sentence to pass on, with
     the host of the address in the error in place of `<host>`: "Docker on my computer cannot download from
     <host>. It needs ghcr.io and pkg-containers.githubusercontent.com, and for Docker Hub
     registry-1.docker.io, auth.docker.io and production.cloudfront.docker.com. Please allow these hosts
     for Docker, or give Docker the root certificate of our network."
   - A port is in use, or one container stays unhealthy: "Known issues" in the development setup says what
     to do. Tell the person what it says, in their words.
   - A download breaks off: start it once more. What has arrived is not downloaded again.
5. **Check.** `docker compose ps -a`: every service is healthy. The images that run are the ones the
   settings name: `docker compose ps --format "{{.Image}}"` and `docker compose config --images` end in the
   same version. If they do not, the stack was started with a version that `.env` does not name, and the
   next start would build it: set `.env` right as in step 3, with the version that runs. Then name the
   address to open: <http://localhost:5600/>. Offer the tour: "Shall I give you a tour of the demo?"

**A person who wants to build the stack from its code** says so, to change a .NET service for example. Then
steps 3 and 4 are these instead: change nothing in `.env` and make none, and start with
`docker compose up -d --build --wait`, as the [development setup](../../../docs/development-setup.md)
does. Say first that it downloads much more and builds for ten minutes or more, and that it needs more
hosts than the start above: the three of Docker Hub named there, mcr.microsoft.com with the hosts its
layers come from (`*.data.mcr.microsoft.com`), registry.npmjs.org, api.nuget.org and
dl-cdn.alpinelinux.org.

## Level 2: build

1. **Node.js.** `node --version` is the version of `.nvmrc`. If it is missing or older, installing it is for
   the person's IT or a helper. The sentence to pass on, with the version that `.nvmrc` names: "Please
   install Node.js in version <version> on my computer." The level ends here as not ready: pnpm and the
   packages wait for Node.js. Say so, and do not check them.
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
- A level is not ready: the next step is to pass on its sentence. Once that is done, the same check takes a
  minute.
- Nothing is ready yet: that is fine. The next step is the same.

## When something stops working later

Go through the same checks in the same order. Start with Docker: if the example app, the chat or a tool of
the stack is gone, the first thing to look at is whether Docker still runs.
