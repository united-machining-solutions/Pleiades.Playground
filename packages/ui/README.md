# The components

The [shadcn/ui](https://ui.shadcn.com) components of the user interface, in one place. shadcn/ui is the design
system of this repository ([AGENTS.md](../../AGENTS.md)), and shadcn does not ship a library: `shadcn add`
writes the source of a component here. The example app and the card catalogue import it from here, and
nobody keeps a second copy. Why one package: [ADR-0009](../../docs/adr/0009-shadcn-components-in-one-package.md).

The layout is the one of the monorepo template of shadcn (`shadcn init --monorepo`), so its docs and its
command line fit as they are.

## What is where

- `src/components/`: one file for a component, as shadcn generated it. Import one as
  `@pleiades/ui/components/<name>`.
- `src/hooks/`: the hooks the components bring along, `@pleiades/ui/hooks/<name>`.
- `src/lib/utils.ts`: `cn`, under the path the docs of shadcn use, `@pleiades/ui/lib/utils`.
- `src/styles/globals.css`: the theme, which is the shadcn tokens of the preset `b5JNecjwG`, light only. A
  page imports it after Tailwind, `@import "@pleiades/ui/globals.css"`, or brings a shadcn theme of its own.
  The font is not part of it.
- `components.json`: the settings of shadcn for this package: the style `base-vega`, on
  [Base UI](https://base-ui.com), with the icons of Lucide.

## A new component

```bash
pnpm --filter @pleiades/app exec shadcn docs <name>     # read its docs first
pnpm --filter @pleiades/app exec shadcn add <name>      # writes src/components/<name>.tsx here
```

The command runs in the app, whose `components.json` points here. A package the component needs goes into
the `catalog` of `pnpm-workspace.yaml` with its version.

## The rules

- A file under `src/components/` stays as generated. What a screen needs beyond it is a component of its own
  that uses it, in the app or in the card catalogue. So an update is one command,
  `shadcn add <name> --diff`, and what it shows is what shadcn changed.
- Where Tailwind reads class names is up to the page. The example app reads this whole package. A card file
  reads only the components the cards draw; `packages/cards/src/styles.css` names them.
- What is not a shadcn component does not belong here: a card, a row of the machine list, a page.
