import { Skeleton } from "@pleiades/ui/components/skeleton"
import { createFileRoute } from "@tanstack/react-router"
import { ScanLineIcon } from "lucide-react"
import { useCallback, useMemo } from "react"
import type { ReactNode } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { liveness, useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { TIMELINE_HOURS } from "@/showcases/trulaser/contract.ts"
import type { Cockpit, ConditionKey, TimelineView } from "@/showcases/trulaser/contract.ts"
import { getTrulaserCockpit, getTrulaserSeries, getTrulaserTimeline } from "@/showcases/trulaser/get-trulaser.ts"
import { cockpitAt, cockpitMessage, timelineAt, timelineMessage, trulaserFilters } from "@/showcases/trulaser/live.ts"
import type { TimelineLive } from "@/showcases/trulaser/live.ts"
import type { Timeline } from "@/showcases/trulaser/timelines.tsx"
import { TrulaserCockpit } from "@/showcases/trulaser/trulaser-cards.tsx"
import { useRead } from "@/showcases/trulaser/use-read.ts"
import { trulaserTitle } from "@/showcases/trulaser/words.ts"

type Hours = (typeof TIMELINE_HOURS)[number]

/** The hours a search asks for, if they are among those the timelines offer. */
function hoursOf(asked: unknown): Hours | undefined {
  return TIMELINE_HOURS.find((one) => one === Number(asked))
}

export const Route = createFileRoute("/(showcases)/trulaser")({
  staticData: { nav: { title: "TruLaser", icon: ScanLineIcon } },
  validateSearch: (search): { machine?: string; last?: Hours | undefined } => ({
    ...(typeof search.machine === "string" && search.machine !== "" && { machine: search.machine }),
    last: hoursOf(search.last),
  }),
  // The cards depend on the machine only: other hours read the timelines again, not the cards.
  loaderDeps: ({ search }) => ({ machine: search.machine }),
  // If the server of the app itself is away for a moment, the page says so and keeps trying.
  loader: ({ deps }) =>
    getTrulaserCockpit({ data: deps.machine === undefined ? {} : { machine: deps.machine } }).catch((error: unknown) => ({
      values: null,
      error: String(error),
    })),
  component: Trulaser,
  pendingComponent: Loading,
})

/**
 * The history of the status for the hours chosen, read on its own: undefined while on its way, null if it
 * is not to be had. From then on the broker keeps it up to date, as it does the cards.
 */
/** How a card reads the timelines of a view when it opens them. */
function useReadTimeline(machine: string) {
  return useCallback(
    (view: TimelineView, hours: number) => getTrulaserTimeline({ data: { machine, view, hours } }).catch(() => null),
    [machine],
  )
}

/** How the ConditionGuide card reads the values of one tile, for its chart: over the hours of the page. */
function useReadSeries(machine: string, hours: number) {
  return useCallback(
    (key: ConditionKey) => getTrulaserSeries({ data: { machine, key, hours } }).catch(() => null),
    [machine, hours],
  )
}

function useStatusTimeline(machine: string, hours: number): TimelineLive | null | undefined {
  const read = useCallback(
    () => getTrulaserTimeline({ data: { machine, view: "status", hours } }).then((timeline) => timeline && { timeline, recent: {} }),
    [machine, hours],
  )
  return useRead(machine ? read : null)
}

function Trulaser() {
  const answer = Route.useLoaderData()
  const { last: hours = 1 } = Route.useSearch()
  const navigate = Route.useNavigate()
  const machine = answer.values?.status.machine ?? ""
  const filters = useMemo(() => (machine ? trulaserFilters(machine) : []), [machine])

  const cockpitLive = useMemo<Live<Cockpit | null>>(
    () => ({
      filters,
      message: (cockpit, topic, payload, now) => cockpit && cockpitMessage(cockpit, topic, payload, now),
      at: (cockpit, now) => cockpit && cockpitAt(cockpit, now),
    }),
    [filters],
  )
  const timelineLive = useMemo<Live<TimelineLive | null | undefined>>(
    () => ({
      filters,
      message: (state, topic, payload, now) => state && timelineMessage(state, topic, payload, now),
      at: (state, now) => state && timelineAt(state, now),
    }),
    [filters],
  )
  const { values: cockpit, connected } = useLive(answer.values, cockpitLive)
  const { values: history } = useLive(useStatusTimeline(machine, hours), timelineLive)
  const timeline: Timeline = history === undefined ? undefined : (history?.timeline ?? null)
  const readTimeline = useReadTimeline(machine)
  const readSeries = useReadSeries(machine, hours)
  useRetry(answer.values === null)

  if (answer.values === null || cockpit === null) {
    return (
      <Page title="TruLaser">
        <NoAnswer error={answer.error ?? ""} />
      </Page>
    )
  }
  const { status } = cockpit
  return (
    <Page
      title={trulaserTitle(status)}
      line={`Model ${String(status.signals.model.value ?? "–")} · ${status.machine} · ${liveness(connected, status.asOf)}`}
    >
      <TrulaserCockpit
        cockpit={cockpit}
        timeline={timeline}
        hours={hours}
        onHours={(next) => void navigate({ search: (previous) => ({ ...previous, last: hoursOf(next) }) })}
        readTimeline={readTimeline}
        readSeries={readSeries}
      />
    </Page>
  )
}

function Page({ title, line, children }: { title: string; line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {line && <p className="text-sm text-muted-foreground">{line}</p>}
      </div>
      {children}
    </div>
  )
}

function Loading() {
  return (
    <Page title="TruLaser">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </Page>
  )
}
