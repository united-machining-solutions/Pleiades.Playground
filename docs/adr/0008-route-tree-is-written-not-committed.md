---
title: "The route tree of the example app is written, not committed"
status: proposed
date: 2026-11-13
---

# ADR-0008: The route tree of the example app is written, not committed

## Context

The example app uses the file-based routes of TanStack Router. The plugin of TanStack Start writes
`apps/app/src/routeTree.gen.ts` from the files under `src/routes/`, and the application imports it. TanStack
advises to commit that file: its FAQ calls it part of the runtime of the application and wants other
developers to be able to build with it, and the skill that ships with the router plugin says "Commit
`routeTree.gen.ts`".

In this repository several people add a page each at the same time, on branches of one repository. The
generated file holds every path of the application on single lines, so two branches that add one page each
always conflict in it. Measured on 13 November 2026 with six new pages: of the fifteen pairs, merged the way
git merges two branches, fifteen conflicted, in one to ten places. A conflict there breaks the build until
somebody builds again and commits the result, and a pull request with it cannot be merged on GitHub.

## Decision

- `routeTree.gen.ts` is ignored by git.
- Everything that needs the file writes it first:
  - `pnpm install` writes it, through a `postinstall` of the app, so an editor has the types on a fresh
    clone.
  - `pnpm typecheck` writes it before `tsc` runs, so CI needs no new step and no new order.
  - The development server and the build write it as before, the image of the app included.
- `apps/app/route-tree.mjs` does the writing for the first two. The plugin generates the tree while Vite
  reads its configuration, so the script reads the configuration with Vite's `resolveConfig` and builds
  nothing. The file is the one the build writes.

## Consequences

- Two branches that add a page each merge without a conflict in the route tree.
- The repository departs from the advice of TanStack. An agent that loads the skill of the Router reads
  "commit the file" there; `AGENTS.md` names the difference next to the rule that asks for that skill, and
  a comment stands at the import in `src/router.tsx`.
- That the plugin generates while the configuration is read is how it works today, and no promise of
  TanStack. If an update moves it, `route-tree.mjs` says that no file was written, and the typecheck of CI
  fails on that update, because the file is not in the repository. The development server and the build do
  not depend on the script.
- After a pull that removes the file from a checkout, it is back after a typecheck, the development server
  or a build. `pnpm install` on a checkout that is up to date does not run the `postinstall` again.

The way back is one commit: remove the line from `.gitignore`, commit the file, and drop `route-tree.mjs`
with the two script entries in `apps/app/package.json`.

## Alternatives considered

- **Commit the file, as TanStack advises.** Fewer moving parts and no departure from the docs. Every second
  pull request with a page then needs a merge by hand and a rebuild before it can be merged.
- **Commit it, and say in the recipe how to resolve the conflict.** It keeps the conflict and moves the work
  to whoever merges second.
- **Generate with the CLI of the Router** (`tsr generate`). Not tried: the CLI is not part of this workspace,
  and the tree of a TanStack Start application ends with a registration that the Start plugin adds, so the
  two would have to be shown to write the same file first.
