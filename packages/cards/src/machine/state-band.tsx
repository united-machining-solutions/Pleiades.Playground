import type { MachineShow, Span, State } from "./contract.ts"
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

/**
 * The spans of a band. They reach a card after its values: undefined while they are on their
 * way, null if they are not to be had.
 */
export type Spans = ReadonlyArray<Span> | null | undefined

/**
 * What a machine did over the last hours: one band, and below it how long each state lasted in
 * total. The sums say in words what the band shows. They come with the history: the backend
 * adds them up. Without its spans the band is left out, and the sums stand alone.
 */
export function StateBand({ history, spans }: { history: MachineShow["history"]; spans: Spans }) {
  const hours = Math.round((Date.parse(history.to) - Date.parse(history.from)) / 3_600_000)
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span>{hours <= 1 ? "Last hour" : `Last ${hours} hours`}</span>
        <span>
          {clock(history.from)} to {clock(history.to)}
        </span>
      </figcaption>
      {/* The sums below say the same in words, so the band itself is skipped by a screen reader. */}
      {spans === undefined && <div aria-hidden className="h-3 animate-pulse rounded-sm bg-muted" />}
      {spans && (
        <div aria-hidden className="flex h-3 overflow-hidden rounded-sm">
          {spans.map((span) => (
            <div
              key={span.from}
              className={band[span.state]}
              style={{ flexGrow: Date.parse(span.to) - Date.parse(span.from), flexBasis: 0 }}
            />
          ))}
        </div>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
        {history.totals.map(({ state, seconds }) => (
          <li key={state} className="flex items-center gap-1.5">
            <StateSymbol state={state} />
            {stateLabel[state]} {lasting(seconds * 1000)}
          </li>
        ))}
      </ul>
    </figure>
  )
}
