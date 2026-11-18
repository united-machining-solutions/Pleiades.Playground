# Juice bar - skill guide

The juice bar is a real machine that mixes drinks from up to eight bottles. This server reads its card and
its state and can place an order. It never starts the production: a person does that at the machine.

## Tools

| Tool | What it does |
|---|---|
| `juicebar_drinks_list` | The drinks the machine can mix now, with id, title, description and ingredients. |
| `juicebar_drink_get` | One drink by its id. |
| `juicebar_status` | Connection, production state, progress, waiting orders, pumps and low-bottle warnings. |
| `juicebar_order_create` | Places one drink in the queue of the real machine. |
| `juicebar_order_get` | One order by its number: state, progress, place in the queue. |

## Ordering

1. Read the card with `juicebar_drinks_list` and let the person choose. Use the id of the drink, never its title.
2. Call `juicebar_order_create` once, and only when a person asked for that drink. An order cannot be cancelled.
3. Tell the person the order number and what comes next: put a glass under the outlet and press the start
   button on the machine.
4. Follow it with `juicebar_order_get` if the person wants to know.

An order is refused while the machine is not connected or not ready, while the queue is full, or when
ordering is switched off. Say why, in the words of the refusal. If a call fails without a clear refusal, read
`juicebar_status` before you try again: the order may have been placed.

## Values

- Progress is a fraction from 0 to 1.
- A bottle volume is the configured size of a full bottle in cubic metre (0.0015 is 1.5 litre). The machine
  measures no fill level; `amountWarning` says that a bottle runs low.
- Production states are the machine's own words: `waitingOrder` (idle), `waitingStart` (an order waits for
  the start button), `processingOrder` (mixing), `waitingPump`, `productionPaused` and
  `pumpControlServiceMode` (not ready).
- Order states: `waitForProduction`, `readyForProduction` (press the start button), `inProduction`,
  `productionFinished`, `error`.
