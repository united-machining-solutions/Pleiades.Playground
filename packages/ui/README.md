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

## Which components are here

Every component of the style that needs no package of its own, so that nobody has to add one in the middle
of other work, and `chart`. Three more are ours.

**Ours, on Base UI.** shadcn has no file for them, and Base UI has the part. Each is that part with the
classes of its neighbours, and says so in its first lines:

| File | Base UI | Looks like | For |
|---|---|---|---|
| `meter.tsx` | `Meter` | `progress.tsx` | a measurement in its range: a load, a temperature. `Progress` is for how far a task has come |
| `number-field.tsx` | `NumberField` | `input.tsx`, `input-group.tsx` | a number with its range, its step and its format: a set point |
| `otp-field.tsx` | `OTPField` | the `input-otp` of shadcn | a short code, one character a slot |

**Left out on purpose.** `second-ways.test.ts` fails if one of these packages, `vaul` or a package of Radix
is added:

| Component of shadcn | Its package | Instead |
|---|---|---|
| `sonner` | `sonner`, `next-themes` | `toast.tsx`, on the Toast of Base UI |
| `command` | `cmdk`, which brings four packages of Radix | `combobox.tsx` for a list to search in |
| `input-otp` | `input-otp` | `otp-field.tsx` |

Not here yet, because nothing needs them, and each brings a package: `calendar` (react-day-picker,
date-fns), `carousel` (embla), `resizable` (react-resizable-panels) and `code-block` (shiki). Adding one
is a decision for a pull request of its own. `form` is empty in this style: a form is `field.tsx` and a
form library.

The chart is [Recharts](https://recharts.org), as shadcn has it. A series is thinned out before it is
drawn: never more points than the picture is wide in pixels. The Timeseries API does that when asked
(`downsample=true`, with the width as `limit`).

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
  `shadcn add <name> --diff`, and what it shows is what shadcn changed. The three files that are ours are
  the exception, and the day shadcn has one of them, the same command shows the difference.
  One generated file differs by a line: `scroll-area.tsx` came with an import it does not use, which the
  type check of this repository does not let through.
  A `"use client"` line in such a diff is noise from shadcn: it is meant to drop the line from every file
  here and drops it from every other one, so which files keep it depends on their order
  (shadcn-ui/ui#12381).
- One way for each thing. Before a package comes in for something a component here does already, it is a
  decision, and `second-ways.test.ts` holds the ones that were made.
- Where Tailwind reads class names is up to the page. The example app reads this whole package. A card file
  reads only the components the cards draw; `packages/cards/src/styles.css` names them.
- What is not a shadcn component does not belong here: a card, a row of the machine list, a page.
