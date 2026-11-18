---
title: "A .NET service draws its own page with Blazor"
status: proposed
date: 2026-11-17
---

# ADR-0016: A .NET service draws its own page with Blazor

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

## Decision

- **A .NET service under `source/` that needs a page of its own draws it with Blazor**, interactive on the
  server (`AddInteractiveServerComponents`), in the same project and the same container. The page updates
  over the SignalR connection Blazor keeps anyway, so a simulator needs no API of its own for its page.
- **The page is a tool for developers, not a part of the product.** It uses plain CSS with the colour and
  radius tokens of `packages/ui`, so that it looks related, and no component library.
- **The shadcn rule stays as it is.** It applies to `apps/` and `packages/cards`. A screen for the people who
  use Pleiades belongs there, built from `@pleiades/ui`, and reads its data through a contract.

## Consequences

- One container per simulated machine, with its own page, as the cutting simulator asked for. The .NET Dockerfile
  keeps `source/` as its build context, and no Node.js stage is needed.
- The page does not use the components of the design system. A button there looks like one of the app, but
  it is not the same component. That is acceptable for a tool page and would not be for a product screen.
- A second page of this kind should share its stylesheet with the first, not copy it.

## Alternatives considered

- **A separate app under `apps/` with shadcn/ui.** This follows the design system, but needs a REST or
  Server-Sent Events API in the simulator and a second container per machine. That is three more containers for
  three machines, for a page only developers open.
- **A TypeScript page built into the .NET image.** One container, but the build context of the image would be
  the repository root instead of `source/`. That changes ADR-0001 for every .NET image, or for one of them.
