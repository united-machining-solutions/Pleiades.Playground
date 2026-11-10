---
title: "Monorepo layout: source/, apps/, packages/, contracts/"
status: accepted
date: 2026-11-10
---

# ADR-0001: Monorepo layout

## Context

The demo case needs data services (.NET), a generative UI backend and an example app (TypeScript), contracts
and a stack that starts with one command. Several companies contribute. The technology of a service must stay a
choice of that service.

## Decision

One repository with these top-level folders:

- `source/`: one .NET solution, every project directly below it, one build configuration
  (`Directory.Build.props`), central package versions, nuget.org as the only feed.
- `apps/` and `packages/`: TypeScript applications and shared packages in a pnpm workspace.
- `contracts/`: the agreed interfaces, independent of any service.
- `stacks/`: configuration of third-party containers.
- `compose.yaml` at the root: the demo stack.

The four architecture layers (solution, agentic, tool, data) are documented in the README and not mirrored as
folders: a .NET worker in the data layer references the client of an API in the tool layer, and a folder per
layer would cut through one solution.

## Consequences

- One `dotnet build` and one `docker compose up` cover everything.
- Every service keeps its own `Dockerfile`; the build context of .NET images is `source/`.
- A service can move to its own repository later by moving its folders; the monorepo is a means, not a principle.

## Alternatives considered

- **Folders per layer**: closer to the architecture picture, but cross-layer project references and one
  toolchain per language made it awkward.
- **One repository per service**: independent releases, but no single start for the demo.
