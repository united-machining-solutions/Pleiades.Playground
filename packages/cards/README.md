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

The list of machines, the result of `genui_machine_list`, has a contract here too (`machineList`), but no
card: an application draws it with rows of its own and checks what it gets against the contract.

**What a model reads is short, and a series is fetched by the card itself.** The contract of a card holds
what a language model may read with it: a few values. What grows with time or with the number of things
has a contract of its own and a tool of its own, which only a card calls. For the machine card that is
`spanList`, the states of its band (`genui_span_list`): whoever draws the card asks for them with the
`from` and `to` of its values and hands them in as they arrive. The card stands without them.

Nothing is built here. The package is source: an import names the file, for example
`@pleiades/cards/machine/contract.ts`.

## Who imports what

| Importer | Files | Needs |
|---|---|---|
| The backend, in Node.js | `.ts` files only: contracts and rules | `zod` |
| An application, through its bundler | everything | React, the components of `@pleiades/ui` and a theme: its `globals.css`, or one of its own |
| A card file of the backend, through its bundler | everything | the same |

Node.js runs the `.ts` files as they are. So they use no syntax that needs compiling, every import names its
file with `.ts`, and none of them imports a `.tsx` file. React and `@pleiades/ui` are optional peer
dependencies: whoever draws a card brings them, and the image of the backend stays without them.

A card is drawn in two places: by an application that imports the component, and by a
[card file](../../apps/genui-mcp/README.md) of the backend, one HTML page that a host of MCP Apps shows.
Both import the theme from [`packages/ui`](../ui/README.md), so the card looks the same in both.

## What is where

- `src/machine/`: what is shown about a machine.
  - `contract.ts`: the shape of a machine as the tools return it, the contract of the machine card and of
    the spans of its band, and after how many seconds of silence a machine is not live.
  - `state.ts`: which value of the binding is which state on the screen. This file decides it, nothing else
    does: the backend asks it for the past, the lists and the cards for the present.
  - `tell.ts` says in words what is the matter, `format.ts` writes times and durations, `state-symbol.tsx`
    draws the signs, `state-band.tsx` the band of states over time.
  - `in-words.ts`: the list and the card in words, for a reader that does not see them. The backend sends
    them as the text of a result, which is what a language model reads.
  - `machine-card.tsx`: the machine card.
- The [shadcn/ui](https://ui.shadcn.com) components the cards are built from are in
  [`packages/ui`](../ui/README.md), with every other component of the user interface.
- `src/dataviz.css`: chart and state colours. `src/styles.css` is what a page imports: the colours, the class
  names of this package for Tailwind, and one line for each component of `packages/ui` that a card draws. A
  card file so carries the styles of those components and of no other; `styles.test.ts` fails if a line is
  missing or left over.
- The theme is `@pleiades/ui/globals.css`. A page imports it before `styles.css`, or brings a shadcn theme
  of its own.

## A new card

1. Write the contract next to the component, in a folder of its own under `src/`.
2. In `genui-mcp`, add a module for the card under `src/cards/`, with the tool that has that contract as
   its `outputSchema`, and one line in `src/cards/index.ts`. Add a row in
   [`contracts/mcp`](../../contracts/mcp/README.md).
3. Write the component with the inferred type as its properties.
4. In the application, say what the chat draws for a result of the tool: a module for the card, like
   `src/machines/chat.tsx`, and one line in `src/chat/cards.tsx`.
5. For other hosts, add a page for the card under `apps/genui-mcp/ui/` and link it from the tool. The build
   finds the page by itself.
6. If the card shows a series, keep it out of the contract of the card: give it a contract and a tool of its
   own, and let the application and the card file ask for it.

```bash
pnpm --filter @pleiades/cards test
pnpm --filter @pleiades/cards typecheck
```
