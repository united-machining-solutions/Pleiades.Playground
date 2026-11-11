import type { MachineShow, State } from "./contract.ts"
import { clock, lasting } from "./format.ts"
import { stateLabel } from "./state.ts"
import { StateSymbol } from "./state-symbol.tsx"

/**
 * How a state looks as a band on a time axis. Never colour alone: an alarm and missing data are
 * hatched, a stop and setup carry an edge.
 */
const band: Record<State, string> = {
  running: "bg-state-running",
  alarm: "band-alarm",
  stopped: "bg-state-stopped shadow-[inset_0_0_0_1px_var(--state-stopped-edge)]",
  setup: "bg-state-setup shadow-[inset_0_0_0_1px_var(--state-setup-edge)]",
  "no-data": "band-no-data",
}

/** The order in which the sums below the band are read. */
const order: ReadonlyArray<State> = ["running", "setup", "stopped", "alarm", "no-data"]

/**
 * What a machine did over the last hours: one band, and below it how long each state lasted in
 * total. The sums say in words what the band shows.
 */
export function StateBand({ history }: { history: MachineShow["history"] }) {
  const total = Date.parse(history.to) - Date.parse(history.from)
  const sums = new Map<State, number>()
  for (const span of history.spans) {
    sums.set(span.state, (sums.get(span.state) ?? 0) + Date.parse(span.to) - Date.parse(span.from))
  }
  const hours = Math.round(total / 3_600_000)
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span>{hours <= 1 ? "Last hour" : `Last ${hours} hours`}</span>
        <span>
          {clock(history.from)} to {clock(history.to)}
        </span>
      </figcaption>
      {/* The sums below say the same in words, so the band itself is skipped by a screen reader. */}
      <div aria-hidden className="flex h-3 overflow-hidden rounded-sm">
        {history.spans.map((span) => (
          <div
            key={span.from}
            className={band[span.state]}
            style={{ flexGrow: Date.parse(span.to) - Date.parse(span.from), flexBasis: 0 }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
        {order
          .filter((state) => sums.has(state))
          .map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <StateSymbol state={state} />
              {stateLabel[state]} {lasting(sums.get(state) ?? 0)}
            </li>
          ))}
      </ul>
    </figure>
  )
}
