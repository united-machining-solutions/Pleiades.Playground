---
name: setup
description: Gets a computer ready for the demo stack with a person who may never have done this - Docker and the stack, Node.js, pnpm and the packages, and a language model for the chat, the one of the hackathon hub included. Use when a person has just got the repository, says "set me up", "get me started", "is my computer ready", or when the stack, the example app or the chat does not run.
---

# Set up

The person may never have used a terminal. You check, explain and do what you may; they say yes and click.
At the end they know what their computer is ready for, and hold one sentence to pass on for each thing that
is missing.

## How you talk

- Plain words in the person's language, addressed the way they address you. Say "the program that runs the
  demo" once before you say Docker.
- One step at a time. After each check, one sentence on what you found, good news too.
- Ask before you start, install or download anything, and say how long it takes. During a long run, say
  every minute or two that it is still at it, or say beforehand that you cannot.
- Never open or print `.env`, and write it only as a fresh copy of `.env.example`, which holds no key. Never
  ask for a key; if the person offers one, say no: they put it in themselves.
- If a step fails, do not look for a way around it, also when the person is in a hurry. Stop that level and
  give the sentence to pass on: for their IT or a helper, in their language, on a line of its own. Installing
  a program is for those too; the steps are in the [development setup](../../../docs/development-setup.md).

## Three levels

| Level | The person can | It needs |
|---|---|---|
| 1. See the demo | open the example app and take the tour | Docker, the stack started |
| 2. Build | add a page, a card or a source with `build-your-own` | Node.js, pnpm, the packages |
| 3. Chat | get answers in the chat of the example app | level 1, a language model |

Go through them in this order. Each ends ready, not ready with what is missing, or not checked with why.
Level 2 does not wait for level 1; level 3 does.

## Level 1: see the demo

1. **Docker.** `docker version`.
   - Unknown command: not installed. Pass on: "Please install Docker Desktop on my computer. It needs
     administrator rights, and on Windows it needs WSL 2."
   - A client but no server: installed, not running. The person starts Docker Desktop themselves, from the
     Start menu or the Applications folder: one started from here ends with this app. When its window says
     it runs, check again.
2. **Does the stack run?** `docker compose ps -a`. Every service healthy: go to step 5.
3. **The version.** The demo starts from the published images of `main` and builds nothing. Which images it
   takes is `PLEIADES_VERSION` in `.env`; without `.env`, and in `.env.example`, it is `dev`. Look with
   `docker compose config --images`, never without `--images`: without, it prints every setting, keys too.
   - The `pleiades.playground` images end in `:main`: go on.
   - Not, and no `.env`: ask, copy `.env.example` to `.env`, and set `PLEIADES_VERSION=main` in the copy.
   - Not, and `.env` is there: the person sets `PLEIADES_VERSION=main` in it themselves.

   Then list the images again; if they do not end in `:main`, stop and say what you see. Never put the
   version in front of one command instead: the next start with another version in `.env` builds four images.
4. **Start.** Say that the first start downloads about half a gigabyte, a few minutes on a good connection.
   On a yes: `docker compose up -d --no-build --wait`, in the background, and wait for it to end. Most tools
   cut a command this long off, and that looks like a failure.
   - "certificate", "x509" or "unable to get local issuer certificate": the company network looks into the
     connections. Pass on, with the host from the error: "Docker on my computer cannot download from
     <host>. It needs ghcr.io and pkg-containers.githubusercontent.com, and for Docker Hub
     registry-1.docker.io, auth.docker.io and production.cloudfront.docker.com. Please allow these hosts for
     Docker, or give Docker the root certificate of our network."
   - A port in use, or a container that stays unhealthy: tell the person what "Known issues" in the
     development setup says.
   - A download breaks off: start again. What has arrived stays.
5. **Check.** Every service is healthy, and `docker compose ps --format "{{.Image}}"` ends in the version
   that `docker compose config --images` names. If not, set `.env` as in step 3 to the version that runs, or
   the next start builds. Then name <http://localhost:5600/> and offer a tour of the demo.

**To build the stack from its code**, to change a .NET service for example: change nothing in `.env` and
make none, and start with `docker compose up -d --build --wait` as the
[development setup](../../../docs/development-setup.md) does. Say that it builds for ten minutes or more and
needs more hosts: the three of Docker Hub, mcr.microsoft.com and `*.data.mcr.microsoft.com`,
registry.npmjs.org, api.nuget.org and dl-cdn.alpinelinux.org.

## Level 2: build

1. **Node.js** in the version of `.nvmrc`: `node --version`. Missing or older: pass on "Please install Node.js
   in version <version> on my computer." The level ends here, not ready.
2. **pnpm** in the version `package.json` names: ask first, the first call may download it, then
   `pnpm --version`. Missing: `npm install --global corepack`, then `corepack enable pnpm`; Node.js no longer
   brings Corepack from version 25. No download now: not checked.
3. **The packages.** Ask, then `pnpm install`, a few minutes. "certificate" in an error: as in level 1, for
   registry.npmjs.org.
4. **Check.** `pnpm exec intent list` names the skills of the libraries. Then the person can start with
   `build-your-own`.

## Level 3: chat

Only the chat needs a language model. `node .claude/skills/build-your-own/look.mjs` says under "Chat" whether
one is set; without Node.js, the chat panel of the example app says it. Never look for a key in a file. None
set: follow "When the chat has no language model" in `build-your-own`, or, at the hackathon with a key of its
hub, the section below.

### At the hackathon: the hub

The hub of the hackathon routes, behind one address and one key, to a model on the DGX Spark in the room and
to cloud models. Its handbook gives the person the key, the address and a certificate. Its rules hold: the key
stays out of this conversation and the repository, a key takes at most two requests at once, and the hub is
for trying out finished agents, not for help with code. So this session never runs through it.

1. **The certificate.** The handbook saves it in the home folder, as `.hub0000-ca.crt`, on Windows as
   `hub0000-ca.crt`. This says of each file it finds whether it is the certificate of the hub:
   `node -e "const fs=require('fs'),os=require('os'),{X509Certificate}=require('crypto');for(const n of ['.hub0000-ca.crt','hub0000-ca.crt']){const p=os.homedir()+'/'+n;if(!fs.existsSync(p)||!fs.statSync(p).isFile())continue;const pem=fs.readFileSync(p,'utf8');let ok=false;try{ok=pem.split('-----BEGIN ').length===2&&new X509Certificate(pem).fingerprint256==='49:6A:BB:24:4D:17:39:3D:FD:4C:F0:64:7A:79:A0:FB:59:6C:13:37:1A:C2:E8:D8:DB:A1:76:69:FF:70:9C:10'}catch{}console.log(n,ok?'is the certificate of the hub':'is NOT the certificate of the hub')}"`.
   `is NOT`: stop, and the person asks the organizers. A file with a second block in it is NOT too, whatever
   the first one is: the app trusts every certificate in the file, so a check of the first one would let an
   added root through. Nothing found: the person runs the setup command of the handbook.

   The app trusts it only through a `compose.override.yaml` next to `compose.yaml`, which Docker Compose
   reads by itself. Ask, write it with the name found, on Windows `~/hub0000-ca.crt`, and add the line
   `compose.override.yaml` to `.git/info/exclude`. A name that is not there makes Docker Desktop create an
   empty folder of that name in the home folder: the person deletes it and the check above runs again. If an
   override is there already, the person adds the lines:

   ```yaml
   services:
     app:
       volumes:
         - ~/.hub0000-ca.crt:/etc/ssl/certs/hub-ca.crt:ro
       environment:
         NODE_EXTRA_CA_CERTS: /etc/ssl/certs/hub-ca.crt
   ```

2. **The profile.** The handbook has the person set the key as `UMS_AI_KEY` and the address as
   `OPENAI_BASE_URL`. This tells without showing them:
   `node -e "const e=process.env;console.log(e.UMS_AI_KEY?'key set':'key not set',e.OPENAI_BASE_URL?'- address set':'- address not set',e.OPENAI_API_KEY&&e.OPENAI_API_KEY===e.UMS_AI_KEY?'- OPENAI_API_KEY holds the key too':'')"`.
   - `not set`, though the person set it: a variable reaches only programs started after it. They restart
     this program and the terminal, then this skill.
   - `OPENAI_API_KEY holds the key too`: the handbook sets it for other tools. Docker Compose prefers it to
     `.env`, and the app would send the key to OpenAI with the first question. Ask, and add one line under
     `environment` in the `compose.override.yaml` of item 1. It keeps the key out of the app at every start:

     ```yaml
         environment:
           NODE_EXTRA_CA_CERTS: /etc/ssl/certs/hub-ca.crt
           OPENAI_API_KEY: ""
     ```

     Say that a key of OpenAI of the person's own in `.env` then does not reach the app either.
3. **The settings**, in the block for any other endpoint in `.env`. The first two lines name the variables
   of the profile and hold no value; without `OPENAI_BASE_URL`, the person writes the address of the handbook
   into the first line instead. No `.env`: a fresh copy as in level 1. Otherwise the person puts the lines in.

   ```
   LLM_BASE_URL=${OPENAI_BASE_URL}
   LLM_API_KEY=${UMS_AI_KEY}
   LLM_MODELS=spark/qwen3.8-27b
   ```

4. **Start and check.** `docker compose up -d app`. A warning that a variable is not set means the app
   started without it: back to item 2. Then ask the hub from inside the app. This prints no key:

   ```
   docker compose exec -T app node -e "fetch(process.env.LLM_BASE_URL+'/models',{headers:{Authorization:'Bearer '+process.env.LLM_API_KEY}}).then(async r=>{const ids=r.ok?(await r.json()).data.map(m=>m.id):[];console.log(r.status,(process.env.LLM_MODELS||'').split(',').map(n=>n.trim()+(ids.includes(n.trim())?' listed':' missing')).join(', '));console.log('the hub has:',ids.join(','))}).catch(e=>console.log(e.cause?.code||e.message))"
   ```

   - `200` and `listed`: the chat answers, in some seconds, since the Spark serves the whole room. The
     second line names every model of the hub, in the form `LLM_MODELS` takes. Offer it: the person puts it
     into that line, and after `docker compose up -d app` a chat switches between them. The first one
     answers until a chat picks another; models of a key of Anthropic or OpenAI in `.env` come before them.
   - `missing`: the hub has no model of that name.
   - `401`: the key is wrong or has ended, or did not reach the app: item 2. Every model shows `missing`
     then too; the status counts first.
   - `ERR_INVALID_URL`: the app has no address: items 2 and 3.
   - `ENOTFOUND` or `EAI_AGAIN`: the computer is not in the WLAN of the hub, or a VPN of the company hides
     the hub's names. Whether it may be off is for the person or their IT.
   - `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, or `SELF_SIGNED_CERT_IN_CHAIN` when the hub sends its root along:
     item 1.

   Questions about the access or a key go to the organizers.

## Say where it stands

One line per level: ready, not ready with what is missing, or not checked with why. Below it, the sentences to
pass on, one per line. Then what the person can do now: take the tour, start `build-your-own`, or pass on a
sentence, after which the same check takes a minute. Nothing ready yet is fine; the next step is the same.

When something stops working later, go through the same checks in the same order, Docker first.
