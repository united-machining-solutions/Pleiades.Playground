---
title: "A showcase is built in on request and only adds"
status: proposed
date: 2026-11-18
---

# ADR-0018: A showcase is built in on request and only adds

## Context

The playground is two things at once. It is the base others are meant to build on: the contracts, the
services, the generative UI backend, the card catalogue and the design system. And it is the place where a
demo for a fair or a talk is built in a few days: a page with made-up data to discuss an idea, an assistant
that listens and speaks.

Both are wanted, and neither should be thrown away. But whoever takes the example application as a base
should get the first without the second: not hidden behind a switch, but not there. And a demo must not
change what the base does for everyone: the instructions of the chat, the build, the rows of the sidebar.

For services the line exists. An optional service is a Compose profile, off by default (`ultimaker`,
`juicebar`), and `APP_MCP_SERVERS` names its tools to the chat. For pages there was none. The page "Where is
My Job?" drew it for itself, in a comment: made-up data, so no entry in the sidebar.

## Decision

- What is in the repository is of one of two kinds. **Base** works for any machine that follows the data
  model, reads only through the contracts, and needs no made-up data, no named person and no special device.
  Everything else is a **showcase**.
- The base layers take base only: `contracts/`, `source/`, `apps/genui-mcp`, `packages/cards` and
  `packages/ui`. A showcase that needs a card or a tool makes it general first, or draws it in its own
  folder.
- An optional service of the stack, a profile of `compose.yaml` such as `juicebar`, is base with its device.
  A card for its tools may stand in the example application, and draws nothing where `APP_MCP_SERVERS` does
  not name that service.
- A showcase of the example application is a folder `apps/app/src/showcases/<name>/`, and its pages are the
  route files under `apps/app/src/routes/(showcases)/`. The brackets make a folder that adds nothing to an
  address.
- The showcases are built in on request. A build with `APP_SHOWCASES` set has all of them. A build without
  it leaves the folder of their routes out: the router does not know the pages, nothing imports their code,
  and the output has none of it. There is no switch while the application runs.
- So there are two images of one application. `pleiades.playground.app` is the application alone.
  `pleiades.playground.app.showcases` is the same commit built with the showcases, for a demo or a fair. In
  `compose.yaml` the one setting `APP_SHOWCASES` chooses the image, and builds the same on this computer.
- A showcase only adds. It changes no file the base shares, the base reads nothing from a showcase, and no
  page of the base links to a page of one. Take the folders away, and the application builds and runs as
  before. A test holds the files to this.

## Consequences

- An image of the application alone has nothing of a showcase in it, and a stack started without the setting
  runs that image. "Where is My Job?" was the first showcase; once it showed only values of the stack, it
  became a page of the base, and once it opened with made-up orders across machines, a showcase again, while
  its view stays of the base. The page of the juice bar for a fair, `/juice-bar`, is a showcase.
- The Margo app is always the application alone. bart takes an image reference as it stands, so no setting
  can choose the image there, and a release is base. A device that is to show a showcase runs
  `compose.yaml` with the setting, or would need a Margo app of its own, which this record does not ask for.
- A page for a demo costs one folder and one route file, and nobody else's page changes with it.
- The showcases stay in the repository, next to the application they show. Whoever copies the repository
  has their folders and can delete them; whoever pulls the image of the application never had them.
- A package that only a showcase needs still stands in the `package.json` of the application and is
  installed with it. It is in no build that leaves the showcases out. Getting it out of the `package.json`
  too means a package of its own for each showcase, which this record does not ask for.
- One more image is built and published for every commit on `main`, and the continuous integration builds
  the application twice.
- Whether something is base or a showcase is a judgement, and no test can make it. The skills that build a
  page or a card ask the question, and a review answers it.
- The chat has one set of instructions, shared by every page. A showcase that wants a voice of its own needs
  a way to add to them for its own chats. There is none yet.

## Alternatives considered

- **A switch while the application runs.** One image, and a setting that hides the pages of a showcase. The
  code is in the image all the same, which is what this record is there to avoid.
- **A branch for each fair.** Nothing to decide on `main`, but a branch drifts within days, and the
  deployment follows `main` only.
- **A second application, or a repository of its own, for the showcases.** The cleanest cut, also for the
  packages. The layout and the chat would have to move into a package first, and a showcase could no longer
  stand next to the pages it is about. A step for the day the base moves out of the playground.
- **Deleting a showcase after its fair.** Nothing to maintain, and nothing left to show the next time.
