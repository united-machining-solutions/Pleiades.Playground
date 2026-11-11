# cards

The card catalogue (`@pleiades/cards`). A card is what an application draws for the result of one tool of the
generative UI backend. Its contract and its component lie next to each other, so they cannot drift apart:

- The **contract** is a zod schema. [`genui-mcp`](../../apps/genui-mcp/README.md) takes it as the output of the
  tool.
- The **component** takes the inferred type of that schema as its properties. It computes nothing but the
  wording: numbers, order and durations come from the backend.

| Card | Tool | Contract | Component |
|---|---|---|---|
| Machine: what one machine does now, since when, with which program, and the states of the last hours | `genui_machine_show` | `machineShow` in `src/machine/contract.ts` | `MachineCard` in `src/machine/machine-card.tsx` |

Nothing is built here. The package is source: an import names the file, for example
`@pleiades/cards/machine/contract.ts`.

## Who imports what

| Importer | Files | Needs |
|---|---|---|
| The backend, in Node.js | `.ts` files only: contracts and rules | `zod` |
| An application, through its bundler | everything | React, Base UI and the theme of the page |

Node.js runs the `.ts` files as they are. So they use no syntax that needs compiling, every import names its
file with `.ts`, and none of them imports a `.tsx` file. The React libraries are optional peer dependencies:
the application brings them, and the image of the backend stays without them.

## What is where

- `src/machine/`: what is shown about a machine.
  - `contract.ts`: the shape of a machine as the tools return it, the contract of the machine card, and after
    how many seconds of silence a machine is not live.
  - `state.ts`: which value of the binding is which state on the screen. This file decides it, nothing else
    does: the backend asks it for the past, the lists and the cards for the present.
  - `tell.ts` says in words what is the matter, `format.ts` writes times and durations, `state-symbol.tsx`
    draws the signs, `state-band.tsx` the band of states over time.
  - `machine-card.tsx`: the machine card.
- `src/ui/`: the [shadcn/ui](https://ui.shadcn.com) components the cards are built from, kept as generated.
  An application imports them from here instead of keeping a second copy.
- `src/dataviz.css`: chart and state colours. `src/styles.css` is what a page imports: the colours, and the
  class names of this package for Tailwind. The theme itself (the shadcn tokens) is the page's own.

## A new card

1. Write the contract next to the component, in a folder of its own under `src/`.
2. In `genui-mcp`, add the tool with that contract as its `outputSchema`, and a row in
   [`contracts/mcp`](../../contracts/mcp/README.md).
3. Write the component with the inferred type as its properties.
4. In the application, draw the component where the result of the tool arrives.

```bash
pnpm --filter @pleiades/cards test
pnpm --filter @pleiades/cards typecheck
```
