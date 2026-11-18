import { Skeleton } from "@pleiades/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { clock, lasting } from "../machine/format.ts"
import { TIMELINE_HOURS } from "./contract.ts"
import type { Lane, TrulaserTimeline } from "./contract.ts"

/** The timelines as they reach a card: undefined while on their way, null if they are not to be had. */
export type Timeline = TrulaserTimeline | null | undefined

/** How a value looks in its lane: a state where it says one, else a category of its lane. */
const RUNNING = new Set(["Executing", "Processing", "Active", "Running", "Start", "Continue", "Reentry"])
const STOPPED = new Set(["NotExecuting", "Idle", "NotRunning", "OperatorStop", "Standstill", "Finished"])
const ALARM = new Set(["OutOfService", "Cancelled", "Aborted"])
const NEUTRAL = new Set(["Setup", "None", "Invalid", "NotAvailable"])

/** How many categorical colours the theme names, `--chart-1` and on. */
const COLOURS = 14

/**
 * The look of a value in a lane. A state of the machine takes the colours of the states, a value
 * that is not a state, a change cause for example, the categorical colours in the order it first
 * appears in its lane. Never colour alone: every span carries its value as a word where it has room,
 * and in its title.
 */
function lookOf(lane: Lane, value: string | null, categories: ReadonlyArray<string>): { className: string; colour?: string } {
  if (value === null) return { className: "bg-muted" }
  if (lane.key === "unitsInMalfunction" || value.includes("blocked: InternalMalfunction") || ALARM.has(value)) {
    return { className: "band-alarm text-white" }
  }
  const head = value.split(",")[0] ?? value
  if (RUNNING.has(head)) return { className: "bg-state-running text-white" }
  if (STOPPED.has(head)) {
    return { className: "bg-state-stopped text-state-ink shadow-[inset_0_0_0_1px_var(--state-stopped-edge)]" }
  }
  if (NEUTRAL.has(head)) {
    return { className: "bg-state-setup text-state-ink shadow-[inset_0_0_0_1px_var(--state-setup-edge)]" }
  }
  const index = categories.indexOf(value)
  return { className: "text-white", colour: `var(--chart-${(Math.max(0, index) % COLOURS) + 1})` }
}

/** Where an instant lies on the axis, in percent of its width. */
function placeOf(instant: string, from: number, width: number): number {
  return ((Date.parse(instant) - from) / width) * 100
}

/** About six clock times along the axis, on whole minutes. */
function ticksOf(from: number, to: number): Array<number> {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240].map((minutes) => minutes * 60_000)
  const step = steps.find((one) => (to - from) / one <= 7) ?? 4 * 3_600_000
  const ticks: Array<number> = []
  for (let at = Math.ceil(from / step) * step; at <= to; at += step) ticks.push(at)
  return ticks
}

/**
 * The timelines of a TruLaser: one lane for each state, run and automation device on the same time
 * axis, so the interplay of its units shows. Where a unit was in malfunction, a red stripe crosses
 * every lane. It draws the result of `genui_trulaser_timeline` and computes nothing but the wording
 * and where a span lies.
 */
export function Timelines({
  timeline,
  hours,
  onHours,
}: {
  timeline: Timeline
  hours: number
  onHours?: (hours: number) => void
}) {
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        {onHours ? (
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[String(hours)]}
            onValueChange={(value: Array<string>) => {
              const chosen = Number(value[0])
              if (Number.isInteger(chosen)) onHours(chosen)
            }}
            aria-label="How far back"
          >
            {TIMELINE_HOURS.map((one) => (
              <ToggleGroupItem key={one} value={String(one)}>
                {one} h
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : (
          <span>{hours === 1 ? "Last hour" : `Last ${hours} hours`}</span>
        )}
        {timeline && (
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="band-alarm inline-block size-3 rounded-xs" />
              Unit in malfunction
              {timeline.malfunctions.length > 0 && ` (${timeline.malfunctions.length}×)`}
            </span>
            <span>
              {clock(timeline.from)} to {clock(timeline.to)}
            </span>
          </span>
        )}
      </figcaption>
      {timeline === undefined && <Skeleton className="h-64 w-full" />}
      {timeline === null && <p className="text-sm text-muted-foreground">The timelines could not be read.</p>}
      {timeline && <Lanes timeline={timeline} />}
    </figure>
  )
}

function Lanes({ timeline }: { timeline: TrulaserTimeline }) {
  const from = Date.parse(timeline.from)
  const to = Date.parse(timeline.to)
  const width = Math.max(1, to - from)
  const ticks = ticksOf(from, to)
  return (
    <div className="grid grid-cols-[minmax(6rem,9rem)_1fr] gap-x-3 gap-y-1 text-xs">
      {timeline.lanes.map((lane) => (
        <LaneRow key={lane.key} lane={lane} from={from} width={width} timeline={timeline} />
      ))}
      <span />
      <div className="relative h-4 text-muted-foreground tabular-nums">
        {ticks.map((at) => (
          <span
            key={at}
            className="absolute -translate-x-1/2"
            style={{ left: `${((at - from) / width) * 100}%` }}
          >
            {clock(new Date(at).toISOString())}
          </span>
        ))}
      </div>
    </div>
  )
}

function LaneRow({
  lane,
  from,
  width,
  timeline,
}: {
  lane: Lane
  from: number
  width: number
  timeline: TrulaserTimeline
}) {
  const units = lane.key === "unitsInMalfunction"
  // The lane of the units draws every malfunction, also one too short to keep a slot of its own.
  const spans = units ? timeline.malfunctions.map((one) => ({ from: one.from, to: one.to, value: one.units })) : lane.spans
  const categories = [...new Set(spans.flatMap((span) => span.value ?? []))]
  return (
    <>
      <span
        className={`truncate self-center text-right font-medium uppercase tracking-wide ${units ? "text-destructive" : "text-muted-foreground"}`}
        title={lane.topic}
      >
        {lane.label}
      </span>
      <div className="relative h-6 overflow-hidden rounded-sm bg-muted/40">
        {spans.map((span) => {
          const left = placeOf(span.from, from, width)
          const size = placeOf(span.to, from, width) - left
          const look = lookOf(lane, span.value, categories)
          const during = `${clock(span.from)} to ${clock(span.to)}, ${lasting(Date.parse(span.to) - Date.parse(span.from))}`
          return (
            <div
              key={span.from}
              className={`absolute inset-y-0 overflow-hidden px-1 leading-6 whitespace-nowrap ${units ? "min-w-0.5 px-0" : ""} ${look.className}`}
              style={{ left: `${left}%`, width: `${size}%`, background: look.colour }}
              title={`${lane.label}: ${span.value ?? "no value"} · ${during}`}
            >
              {/* A word only where it has room: about four characters for each percent of the width. */}
              {span.value !== null && size > 3 ? span.value : null}
            </div>
          )
        })}
        {/* The units in malfunction cross every lane, so it shows what the others did then. */}
        {!units &&
          timeline.malfunctions.map((one) => {
            const left = placeOf(one.from, from, width)
            const size = placeOf(one.to, from, width) - left
            return (
              <div
                key={one.from}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 min-w-px bg-[var(--state-alarm)] opacity-30"
                style={{ left: `${left}%`, width: `${size}%` }}
              />
            )
          })}
      </div>
    </>
  )
}
