---
title: "A .NET service draws its own page with Blazor"
status: rejected
date: 2026-11-18
---

# ADR-0016: A .NET service draws its own page with Blazor

Rejected as a general way. The page of the cutting simulator stays as it is, as an exception for that simulator
only.

## Context

The cutting simulator simulates one machine per container. It needs a page to drive the machine: switch it
on and off, raise an alarm, edit the production plan, and watch the telegrams go in and out as they happen.
Until now no .NET service had a page. Every user interface is a TypeScript app under `apps/`, built with
shadcn/ui ([AGENTS.md](../../AGENTS.md), [ADR-0009](0009-shadcn-components-in-one-package.md)), and the build
context of a .NET image is `source/` ([ADR-0001](0001-monorepo-layout.md)).

There were three ways:

- A page in the .NET service itself.
- A separate app under `apps/` that talks to the simulator over an API.
- A TypeScript page that is built into the .NET image.

The proposal was to let every .NET service under `source/` that needs a page of its own draw it with Blazor.

## Decision

- **Rejected as a rule.** A .NET service does not draw its own page with Blazor. A page, also a tool page for
  developers, belongs under `apps/`, is built from `@pleiades/ui` and reads its data through a contract, as
  AGENTS.md and ADR-0009 say.
- **One exception: the cutting simulator.** Its page stays in the simulator, drawn with Blazor, interactive on
  the server (`AddInteractiveServerComponents`), in the same project and the same container. It is a tool for
  developers to drive the simulated machine, not a part of the product, and uses plain CSS with the colour and
  radius tokens of `packages/ui`, without a component library.
- **The exception does not carry over.** Another service, simulator or adapter that needs a page does not
  point to this one; it follows the rule, or it needs a decision of its own.

## Consequences

- One container per simulated cutting machine, with its own page. The .NET Dockerfile keeps `source/` as its
  build context, and no Node.js stage is needed.
- The page does not use the components of the design system. A button there looks like one of the app, but it
  is not the same component. That is accepted for this tool page only.
- The colours and the radius of the page are copied by value from the theme of `packages/ui`. They drift when
  that theme changes, and a brand does not reach the page. Whoever changes the theme copies its tokens into
  `wwwroot/app.css` of the simulator by hand.
- Should the page of the cutting simulator grow into more than a tool for developers, it moves under `apps/`.

## Alternatives considered

- **A separate app under `apps/` with shadcn/ui.** This follows the design system and is the way for every
  other page. For the cutting simulator it would need a REST or Server-Sent Events API in the simulator and a
  second container per machine, three more containers for a page only developers open; that is why the
  simulator keeps its exception.
- **A TypeScript page built into the .NET image.** One container, but the build context of the image would be
  the repository root instead of `source/`. That changes ADR-0001 for every .NET image, or for one of them.
