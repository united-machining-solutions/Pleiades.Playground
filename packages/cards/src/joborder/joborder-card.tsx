import { useState } from "react"
import type { ReactNode } from "react"

import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pleiades/ui/components/tooltip"
import { cn } from "@pleiades/ui/lib/utils"
import { clock, duration } from "../machine/format.ts"
import { labelOf } from "../machine/in-words.ts"
import { stateBand } from "../machine/state-band.tsx"
import { StateSymbol } from "../machine/state-symbol.tsx"
import { span as lastingText } from "../notification/words.ts"
import { timeTicks } from "../shared/time-ticks.ts"
import type { JobOrderShow, JobOrderSpan, JobOrderTimeline } from "./contract.ts"
import { counted } from "./in-words.ts"

/** The timeline as it reaches the card: undefined while it is asked for, null if it is not to be had. */
export type Timeline = JobOrderTimeline | null | undefined

/** How a state of a job order or a program execution looks on the timeline: never colour alone, the span carries its word. */
function lookOf(state: string): string {
  if (state === "Running") return cn(stateBand.running, "text-white")
  if (state === "Aborted") return cn(stateBand.alarm, "text-white")
  if (state === "Interrupted") return cn(stateBand.stopped, "text-state-ink")
  return cn(stateBand.setup, "text-state-ink")
}

/** A state in a badge: a sign and a word, never colour alone. */
function StateBadge({ state }: { state: string }) {
  return (
    <Badge variant={state === "Aborted" ? "destructive" : "outline"}>
      {state === "Running" && <StateSymbol state="running" />}
      {state === "Aborted" && <StateSymbol state="alarm" />}
      {state || "unknown"}
    </Badge>
  )
}

/** A time as a clock shows it, a dash for none. */
const clockOf = (instant: string | null | undefined) => (instant ? clock(instant) : "–")

/**
 * The fields of an element of the data model: its name, then a row for each field. Without one, a
 * sentence (`note`) says why.
 */
function Element({ name, state, rows, note }: { name: string; state: string | null; rows?: ReadonlyArray<[string, ReactNode]>; note?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-muted-foreground">{name}</span>
        {state !== null && <StateBadge state={state} />}
      </div>
      {note !== undefined ? (
        <p className="text-sm text-muted-foreground">{note}</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows?.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-mono text-xs leading-5 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value ?? "–"}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

const mono = (text: string | null) => (text ? <code className="font-mono text-xs break-all">{text}</code> : "–")

/** One lane of the timeline: its name, and its spans where they lie on the axis; a span says its fields on hover. */
function Lane({ name, spans, from, width }: { name: string; spans: ReadonlyArray<JobOrderSpan>; from: number; width: number }) {
  const [hovered, setHovered] = useState<JobOrderSpan | null>(null)
  const place = (instant: string) => ((Date.parse(instant) - from) / width) * 100
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[0.6875rem] font-semibold break-all text-muted-foreground">{name}</span>
      <Tooltip trackCursorAxis="x" open={hovered !== null} onOpenChange={(open) => !open && setHovered(null)}>
        <TooltipTrigger
          render={<div />}
          className="relative h-6 overflow-hidden rounded-sm bg-muted/50"
          // Over a gap between two spans the pointer is on the lane itself: then no span is named.
          onPointerOver={(event) => event.target === event.currentTarget && setHovered(null)}
          onPointerLeave={() => setHovered(null)}
        >
          {spans.map((one) => {
            const left = place(one.from)
            const size = place(one.to) - left
            return (
              <div
                key={`${one.id}-${one.from}`}
                className={cn("absolute inset-y-0 min-w-0.5 overflow-hidden border-r border-background px-1 text-xs leading-6 whitespace-nowrap", lookOf(one.state))}
                style={{ left: `${left}%`, width: `${size}%` }}
                onPointerEnter={() => setHovered(one)}
              >
                {/* A word only where it has room. */}
                {size > 6 ? one.label : null}
              </div>
            )
          })}
        </TooltipTrigger>
        <TooltipContent className="flex-col items-start gap-0.5">
          {hovered && (
            <>
              <span className="font-semibold">
                {hovered.label} · {hovered.state}
              </span>
              <span className="tabular-nums opacity-80">
                {/* An open span ends where the timeline does, the `asOf` of the card, which need not be now. */}
                {clock(hovered.from)} to {clock(hovered.to)}, {duration(hovered.from, hovered.to)}
                {hovered.open && ", not ended by then"}
              </span>
              {hovered.details.map(
                (detail) =>
                  detail.value && (
                    <span key={detail.name}>
                      {detail.name} <span className="font-mono">{detail.name.endsWith("Time") ? clock(detail.value) : detail.value}</span>
                    </span>
                  ),
              )}
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

/** The job orders and program executions on one time axis. It draws what it got and computes nothing but where a span lies. */
export function JobOrderTimelines({ timeline }: { timeline: Timeline }) {
  if (timeline === undefined) return <Skeleton className="h-20 w-full" />
  if (timeline === null) return <p className="text-sm text-muted-foreground">The timeline could not be read.</p>
  const [from, to] = [Date.parse(timeline.from), Date.parse(timeline.to)]
  const width = Math.max(1, to - from)
  // Few times, so they do not run into each other on a narrow card.
  const ticks = timeTicks(from, to, 4).filter((at) => (at - from) / width > 0.06 && (at - from) / width < 0.94)
  return (
    <div className="flex flex-col gap-2">
      <Lane name="JobMonitoring.JobOrders" spans={timeline.jobOrders} from={from} width={width} />
      <Lane name="WorkMasterMonitoring.ProgramExecution" spans={timeline.programExecutions} from={from} width={width} />
      <div>
        <div aria-hidden className="relative h-4 text-xs text-muted-foreground tabular-nums">
          {ticks.map((at) => (
            <span key={at} className="absolute -translate-x-1/2" style={{ left: `${((at - from) / width) * 100}%` }}>
              {clock(new Date(at).toISOString())}
            </span>
          ))}
        </div>
      </div>
      {timeline.hasMore && (
        <p className="text-xs text-muted-foreground">The Events API had more than it returned: the oldest spans may be missing.</p>
      )}
    </div>
  )
}

/**
 * The job order card: the job order of one machine (`JobMonitoring.JobOrders` with its result) and its
 * program execution (`WorkMasterMonitoring.ProgramExecution`), by the names of the umati data model, and
 * below them both over the hours as a timeline. It draws the result of `genui_job_order_show`, and of
 * `genui_job_order_timeline` for the timeline, which whoever draws the card asks for and hands in as
 * `timeline`. It computes nothing but the wording.
 */
export function JobOrderCard({ timeline, ...shown }: JobOrderShow & { timeline?: Timeline }) {
  const job = shown.jobOrder
  const run = shown.programExecution
  const atLeast = shown.hasMore ? "at least " : ""
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">Job order of {labelOf(shown.machine)}</CardTitle>
        <CardDescription>
          Last {shown.hours} h: {atLeast}
          {counted(shown.jobOrders, "job order")}, {atLeast}
          {counted(shown.programExecutions, "program execution")}
          {shown.aborted > 0 && `, ${shown.aborted} aborted`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-5">
          {job ? (
            <Element
              name="JobMonitoring.JobOrders"
              state={job.state}
              rows={[
                ["JobOrderID", mono(job.jobOrderId)],
                ["JobName", job.jobName],
                ["WorkMasterID", mono(job.workMaster)],
                ["StartTime", <span className="tabular-nums">{clockOf(job.start)}</span>],
                ["EndTime", <span className="tabular-nums">{clockOf(job.end)}</span>],
                ["ProducedQuantity", <span className="tabular-nums">{job.produced ?? "–"}{job.runsPlanned ? ` of ${job.runsPlanned}` : ""}</span>],
                ["JobResult", job.result],
              ]}
            />
          ) : (
            <Element name="JobMonitoring.JobOrders" state={null} note="No job order." />
          )}
          {run ? (
            <Element
              name="WorkMasterMonitoring.ProgramExecution"
              state={run.State}
              rows={[
                ["ActiveWorkMaster", mono(run.ActiveWorkMaster)],
                ["ExecutionId", mono(run.ExecutionId)],
                ["JobOrderID", mono(run.JobOrderID)],
                ["StartTime", <span className="tabular-nums">{clockOf(run.StartTime)}</span>],
                ["EndTime", <span className="tabular-nums">{clockOf(run.EndTime)}</span>],
                ["Duration", <span className="tabular-nums">{run.Duration === null ? "–" : lastingText(run.Duration)}</span>],
              ]}
            />
          ) : (
            <Element name="WorkMasterMonitoring.ProgramExecution" state={null} note="No program execution." />
          )}
        </div>
        <JobOrderTimelines timeline={timeline} />
      </CardContent>
      <CardFooter className="block text-xs break-words text-muted-foreground">
        As of {clock(shown.asOf)}, from the events {shown.topics.jobs} and {shown.topics.workmasters}
      </CardFooter>
    </Card>
  )
}
