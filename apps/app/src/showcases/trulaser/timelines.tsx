import { useState } from "react"

import { Skeleton } from "@pleiades/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pleiades/ui/components/tooltip"
import { cn } from "@pleiades/ui/lib/utils"
import { clock, duration } from "@pleiades/cards/machine/format.ts"
import { categoryColour } from "@pleiades/cards/shared/colour.ts"
import { TIMELINE_HOURS, detailText, signalValueFields } from "./contract.ts"
import type { Lane, LaneSpan, TimelineView, TrulaserTimeline } from "./contract.ts"

/** The timelines as they reach a card: undefined while on their way, null if they are not to be had. */
export type Timeline = TrulaserTimeline | null | undefined

/** Reads the timelines of a view over the last hours, for a card that opens them. Null if they are not to be had. */
export type ReadTimeline = (view: TimelineView, hours: number) => Promise<TrulaserTimeline | null>

const RUNNING = new Set(["Executing", "Processing", "Active", "Running", "Start", "Continue", "Reentry", "true"])
const STOPPED = new Set(["NotExecuting", "Idle", "Interrupted", "Scheduled", "OffSpec", "CheckFunction"])
const ALARM = new Set(["OutOfService", "Aborted", "Error", "Failure"])
const NEUTRAL = new Set(["Setup", "None", "Invalid", "NotAvailable", "Ended", "false"])

/**
 * The look of a value in a lane. A state takes the colours of the states; a value that is not one, a
 * Maintenance for example, a categorical colour in the order it first appears in its lane. Never colour
 * alone: a span carries its value as a word where it has room, and on hover.
 */
function lookOf(value: string | null, categories: ReadonlyArray<string>): { className: string; colour?: string } {
  if (value === null) return { className: "bg-muted" }
  if (ALARM.has(value)) return { className: "band-alarm text-white" }
  if (RUNNING.has(value)) return { className: "bg-state-running text-white" }
  if (STOPPED.has(value)) return { className: "bg-state-stopped text-state-ink shadow-[inset_0_0_0_1px_var(--state-stopped-edge)]" }
  if (NEUTRAL.has(value)) return { className: "bg-state-setup text-state-ink shadow-[inset_0_0_0_1px_var(--state-setup-edge)]" }
  const index = categories.indexOf(value)
  return { className: "text-white", colour: categoryColour(Math.max(0, index)) }
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

/** The hours a timeline looks back, to choose from. */
export function HoursChoice({ hours, onHours }: { hours: number; onHours: (hours: number) => void }) {
  return (
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
  )
}

/**
 * Timelines on one time axis: a lane for each value, grouped by the element of the data model or of the
 * extension they belong to. Where an alert of the category Failure stood, a red stripe crosses every lane. On hover a span says its
 * value, from when to when, and its details. It draws what `listTimeline` of read.server.ts read and
 * computes nothing but the wording and where a span lies.
 */
export function Timelines({ timeline }: { timeline: Timeline }) {
  if (timeline === undefined) return <Skeleton className="h-56 w-full" />
  if (timeline === null) return <p className="text-sm text-muted-foreground">The timelines could not be read.</p>
  const from = Date.parse(timeline.from)
  const width = Math.max(1, Date.parse(timeline.to) - from)
  const ticks = ticksOf(from, Date.parse(timeline.to))
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div className="grid min-w-[44rem] grid-cols-[minmax(9rem,16rem)_1fr] gap-x-3 gap-y-1 text-xs">
          {timeline.lanes.map((lane) => (
            <LaneRow key={lane.key} lane={lane} from={from} width={width} timeline={timeline} />
          ))}
          <span />
          <div className="relative h-4 text-muted-foreground tabular-nums">
            {ticks.map((at) => (
              <span key={at} className="absolute -translate-x-1/2" style={{ left: `${((at - from) / width) * 100}%` }}>
                {clock(new Date(at).toISOString())}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        {/* Only the view of the status has lanes of the alerts, and so the stripes. */}
        <span className={cn("flex items-center gap-1.5", timeline.view !== "status" && "hidden")}>
          <span aria-hidden className="band-alarm inline-block size-3 rounded-xs" />
          Alert of the category Failure, also as a stripe across every lane
          {timeline.failures.length > 0 && ` (${timeline.failures.length}×)`}
        </span>
        <span>
          {!timeline.alertsComplete && "Some alerts may be missing: the Events API had more than it returned. "}
          {clock(timeline.from)} to {clock(timeline.to)}
        </span>
      </p>
    </div>
  )
}

function LaneRow({ lane, from, width, timeline }: { lane: Lane; from: number; width: number; timeline: TrulaserTimeline }) {
  const failures = lane.key === "alertsFailure"
  const spans = lane.spans
  const categories = [...new Set(spans.flatMap((span) => span.value ?? []))]
  const [hovered, setHovered] = useState<LaneSpan | null>(null)

  return (
    <>
      <div className="flex flex-col items-end justify-center text-right leading-tight" title={lane.topic}>
        {lane.group && (
          <span className={cn("text-[0.6875rem] font-semibold tracking-wide", failures ? "text-destructive" : "text-primary")}>
            {lane.group}
          </span>
        )}
        <span className="text-muted-foreground">{lane.label}</span>
      </div>
      <Tooltip trackCursorAxis="x" open={hovered !== null} onOpenChange={(open) => !open && setHovered(null)}>
        <TooltipTrigger
          render={<div />}
          className={cn("relative h-6 overflow-hidden rounded-sm bg-muted/40", lane.group && lane.key !== timeline.lanes[0]?.key && "mt-2")}
          onPointerLeave={() => setHovered(null)}
        >
          {spans.map((span, index) => {
            const left = placeOf(span.from, from, width)
            const size = placeOf(span.to, from, width) - left
            const look = lookOf(span.value, categories)
            const text = span.label ?? span.value
            return (
              <div
                key={`${index}-${span.from}`}
                className={cn("absolute inset-y-0 min-w-0.5 overflow-hidden px-1 leading-6 whitespace-nowrap", look.className)}
                style={{ left: `${left}%`, width: `${size}%`, background: look.colour }}
                onPointerEnter={() => setHovered(span)}
              >
                {/* A word only where it has room: about four characters for each percent of the width. */}
                {text !== null && size > 4 ? text : null}
              </div>
            )
          })}
          {!failures &&
            timeline.failures.map((one, index) => {
              const left = placeOf(one.from, from, width)
              return (
                <div
                  key={`${index}-${one.from}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 min-w-px bg-[var(--state-alarm)] opacity-25"
                  style={{ left: `${left}%`, width: `${placeOf(one.to, from, width) - left}%` }}
                />
              )
            })}
        </TooltipTrigger>
        <TooltipContent side="top" className="flex-col items-start gap-0.5">
          {hovered && <SpanWords lane={lane} span={hovered} />}
        </TooltipContent>
      </Tooltip>
    </>
  )
}

/** What a span says on hover: its lane and value, from when to when, and its details. */
function SpanWords({ lane, span }: { lane: Lane; span: LaneSpan }) {
  const during = `${clock(span.from)} to ${clock(span.to)}, ${duration(span.from, span.to)}`
  return (
    <>
      <span className="font-semibold">
        {lane.label} {span.value ?? "no value"}
      </span>
      <span className="tabular-nums opacity-80">{during}</span>
      {span.details.map((detail) => {
        // A SignalValue with fields gets a line for each field, below its name.
        const fields = detail.name.endsWith("SignalValue") ? signalValueFields(detail.value) : null
        if (fields) {
          return (
            <span key={detail.name} className="flex flex-col">
              {detail.name}
              {fields.map((one) => (
                <span key={one.name} className="pl-3">
                  {one.name} <span className="font-mono">{one.value}</span>
                </span>
              ))}
            </span>
          )
        }
        const text = detailText(detail)
        return (
          text && (
            <span key={detail.name}>
              {detail.name} <span className="font-mono">{text}</span>
            </span>
          )
        )
      })}
    </>
  )
}
