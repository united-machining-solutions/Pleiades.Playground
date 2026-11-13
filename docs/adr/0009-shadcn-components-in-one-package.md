---
title: "The shadcn/ui components live in one package, packages/ui"
status: proposed
date: 2026-11-13
---

# ADR-0009: The shadcn/ui components live in one package, `packages/ui`

## Context

The user interface is built with shadcn/ui, and shadcn/ui is its design system ([AGENTS.md](../../AGENTS.md)).
shadcn does not ship a library: `shadcn add` writes the source of a component into the repository. Until now
it wrote into two places. Twenty components lay in the example app, under `apps/app/src/components/ui/`. Three
lay in the card catalogue, under `packages/cards/src/ui/`, because a card is also built into a card file of
the generative UI backend, which cannot import from the app.

Two places invite a second copy. An agent that built a second card by the recipe needed `Empty`, found it
only in the app, which a card must not import, and added it to the catalogue a second time. With several
people adding cards and pages at the same time, the two folders drift apart, and nobody can say which
components the design system has.

## Decision

- The components live in one package, `packages/ui` (`@pleiades/ui`), laid out as the monorepo template of
  shadcn lays it out (`shadcn init --monorepo`): `src/components/`, `src/hooks/`, `src/lib/`,
  `src/styles/globals.css`, and a `components.json` in the package and in the app. The app and the card
  catalogue import a component as `@pleiades/ui/components/<name>`.
- `pnpm --filter @pleiades/app exec shadcn add <name>` writes a new component into the package. A generated
  file is kept as generated: what a screen needs beyond it is a component of its own that uses it, in the app
  or in the catalogue.
- The theme, the shadcn tokens, moved with the components: `@pleiades/ui/globals.css`.
- The package does not say where Tailwind reads class names. A page that may draw every component reads the
  whole package (the app). A card file reads only the components the cards draw:
  `packages/cards/src/styles.css` names them, one line each, and a test fails if a line is missing or left
  over.

## Consequences

- There is one answer to "is this component there": the folder `packages/ui/src/components/`.
- An update of a component is `shadcn add <name> --diff` against one file.
- A card that draws a component no card drew before adds one line to a file that cards share,
  `packages/cards/src/styles.css`. Without the line the card file shows the component without its styles,
  which is why the test is there.
- The template of shadcn puts the sources for Tailwind into `globals.css`, for the whole repository. This
  repository does not, on purpose: a card file is one HTML file that a host reads as a whole, and it would
  carry the styles of every component.
- The chart and state colours stay in the card catalogue (`dataviz.css`). Whether the chart colours belong
  with the theme is open.

## Alternatives considered

- **Keep two folders, and say in the recipes which one.** It is what the recipes did, and the second copy
  happened anyway.
- **All components in the card catalogue.** One place too, but a package that is about machines would hold
  the sidebar and the chat, and `shadcn add` would need a path on every call.
- **Let a card file read the whole package.** No list and no test, and every card file grows with every
  component that is added, whether a card draws it or not.
