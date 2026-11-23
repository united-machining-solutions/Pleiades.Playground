# Juice bar - skill guide

The juice bar is a real machine that mixes drinks from up to eight bottles. This server reads its card and
its state and can place an order. It never starts the production: a person does that at the machine.

## Tools

| Tool | What it does |
|---|---|
| `juicebar_drinks_list` | The drinks the machine can mix now, with id, title, description, colour, the picture of a glass, and ingredients, each with its colour and whether its bottle runs low. |
| `juicebar_drink_get` | One drink by its id. |
| `juicebar_status` | Connection, production state, progress, waiting orders, pumps and low-bottle warnings. |
| `juicebar_consumption_get` | Each ingredient on a pump once, in how many sold drinks it was in the last `hours` (1 to 24, 8 if omitted) and since the start, the most used first, and the least used one. |
| `juicebar_order_create` | Places one drink in the queue of the real machine. |
| `juicebar_order_get` | One order by its number: state, progress, place in the queue. |

## Ordering

1. Read the card with `juicebar_drinks_list` and let the person choose. Use the id of the drink, never its title.
2. Call `juicebar_order_create` once, and only when a person asked for that drink. An order cannot be cancelled.
3. Tell the person the order number and what comes next: put a glass under the outlet and press the start
   button on the machine.
4. Follow it with `juicebar_order_get` if the person wants to know.

A host may draw the result of `juicebar_drinks_list` as a card with a button of its own that orders. An order
placed with that button needs nothing from you: do not order the same drink again.

An order is refused while the machine is not connected or not ready, while the queue is full, or when
ordering is switched off. Say why, in the words of the refusal. If a call fails without a clear refusal, read
`juicebar_status` before you try again: the order may have been placed.

## The use of the ingredients

`juicebar_consumption_get` answers which juice to take off a pump: the one in `leastUsedId`, said in `summary`.

- The counts come from the public report of the marketplace the machine takes its recipes from. They count
  sold drinks with the ingredient, over **all machines of the marketplace**, not this one alone, and drinks,
  not millilitres. Say so when you name a count.
- A count is null where it is not known: the ingredient has no name, or the report names only ten ingredients
  and this one is not among them. Then `leastUsedId` is null too: do not guess the least used one.
- Without a marketplace named for the service the tool is refused; say that the use is not known.

## Values

- Progress is a fraction from 0 to 1.
- A bottle volume is the configured size of a full bottle in cubic metre (0.0015 is 1.5 litre). The machine
  measures no fill level; `amountWarning` says that a bottle runs low.
- Production states are the machine's own words: `waitingOrder` (idle), `waitingStart` (an order waits for
  the start button), `processingOrder` (mixing), `waitingPump`, `productionPaused` and
  `pumpControlServiceMode` (not ready).
- Order states: `waitForProduction`, `readyForProduction` (press the start button), `inProduction`,
  `productionFinished`, `error`.
