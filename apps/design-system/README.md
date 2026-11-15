# design-system

The design system of the user interface, on one page: what a Storybook would be elsewhere. It shows the
tokens, every [shadcn/ui](https://ui.shadcn.com) component of [`packages/ui`](../../packages/ui/README.md) in
its variants and states, and what the [card catalogue](../../packages/cards/README.md) builds from them. Look
here before you build an element of your own or add a library: what you need is probably there.

The page is its own small application: [Vite](https://vite.dev) and React, one page with jumps to its
sections, no router and no server. It reads nothing from a backend. Every example stands with fixed values
in the words of the demo: its machines, programs, topics and notifications.

It is not part of the demo stack: it has no `Dockerfile` and no service in `compose.yaml`.

## Start

```bash
pnpm install
pnpm --filter @pleiades/design-system dev
```

The development server listens on <http://localhost:3100/>. `pnpm typecheck`, `pnpm test` and `pnpm build`
in the root folder take the page along; the build writes `dist/`, which is not in the repository.

## What the page shows

1. **Foundations**: the colour roles as pairs with their measured contrast, the chart and state colours of
   [`dataviz.css`](../../packages/cards/src/dataviz.css) with their rules, the type sizes, the radius scale,
   the shadows and the icon sizes. Every value is read from the stylesheet while the page runs.
2. **Actions**, **Inputs**, **Navigation**, **Data display**, **Feedback**, **Overlays** and
   **Conversation**: a block for each component. A block says when to take the component, where to import it
   from and where its docs are, then shows it: its typical use, its variants and sizes, its states side by
   side, and the awkward cases (a long text, nothing there, an error, loading).
3. **Do and Don't**: three rules of this repository that are easy to break, each drawn right and drawn
   wrong.
4. **Built from these**: the machine card, its band of states and the signs of the states, drawn by the
   components of `@pleiades/cards` themselves.

## What is where

- `src/app.tsx`: the page: its head, the jumps and the sections in their order. The two providers at its
  root are the ones the docs of `tooltip` and of `toast` ask an application for.
- `src/sections/`: one file for a section.
- `src/block.tsx`: the frame of the page: a section, the block of one component, the box of an example.
- `src/machine-data.ts`, `src/series-data.ts`: the fixed values of the examples, in the shape of the
  contract of the card catalogue, and the series of the charts.
- `src/state-matrix.tsx`, `src/color-pair.tsx`, `src/preview-states.css`: the helpers of the shadcn skill
  (`.claude/skills/shadcn/assets/showcase/`), copied. The stylesheet lets `data-preview="hover"`, `"focus"`
  or `"active"` pin a state, so the page shows the states of a component side by side.
- `src/styles.css`: Tailwind, the font, the theme of `packages/ui` and the colours of the card catalogue,
  as in the example app.
- `src/coverage.test.ts`: the test that every component of `packages/ui` has its block, see below.

## A new component gets its block

A component that is added to `packages/ui` is not done until it stands here. Give it a block in the section
it belongs to, after the pattern of its neighbours. For which parts a block has, and how to show a state
without touching the component, see the guide of the shadcn skill,
[`design-system-page.md`](../../.claude/skills/shadcn/design-system-page.md).

A test holds the page to it:

```bash
pnpm --filter @pleiades/design-system test
```

`src/coverage.test.ts` reads the components of `packages/ui` and the files of the page, and fails with the
names of the components that no section imports or that have no block. The script of the shadcn skill for
this, `showcase-coverage.mjs`, looks for imports that end in `/ui/<name>`, the path of an application that
keeps its components in a folder of its own. Here a component is imported as
`@pleiades/ui/components/<name>`, so that script finds none of them, and the test takes its place.
