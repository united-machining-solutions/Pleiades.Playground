import { TIMELINE_HOURS } from "@pleiades/cards/trulaser/contract.ts"
import { TrulaserCard } from "@pleiades/cards/trulaser/trulaser-card.tsx"
import { trulaserTitle } from "@pleiades/cards/trulaser/words.ts"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { createFileRoute } from "@tanstack/react-router"
import { ScanLineIcon } from "lucide-react"
import { useMemo } from "react"
import type { ReactNode } from "react"

import { useReadSeries } from "@/cards/trulaser/shown-trulaser.tsx"
import { NoAnswer } from "@/components/no-answer.tsx"
import { liveness, useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { trulaserAt, trulaserFilters, trulaserWith } from "@/live/trulaser.ts"
import type { TrulaserLive } from "@/live/trulaser.ts"
import { getTrulaser, getTrulaserTimeline } from "@/machines/get-machines.ts"
import type { Answer } from "@/machines/get-machines.ts"

type Hours = (typeof TIMELINE_HOURS)[number]

/** The hours a search asks for, if they are among those the timelines offer. */
function hoursOf(asked: unknown): Hours | undefined {
  return TIMELINE_HOURS.find((one) => one === Number(asked))
}

/** The values and the timelines, read once; from then on the broker keeps them up to date. */
async function load(machine: string | undefined, hours: Hours): Promise<Answer<TrulaserLive>> {
  const answer = await getTrulaser({ data: machine === undefined ? {} : { machine } })
  if (answer.values === null) return answer
  const timeline = await getTrulaserTimeline({ data: { machine: answer.values.machine, hours } }).catch(() => null)
  return { values: { values: answer.values, timeline }, error: null }
}

export const Route = createFileRoute("/trulaser")({
  staticData: { nav: { title: "TruLaser", icon: ScanLineIcon } },
  validateSearch: (search): { machine?: string; last?: Hours | undefined } => ({
    ...(typeof search.machine === "string" && search.machine !== "" && { machine: search.machine }),
    last: hoursOf(search.last),
  }),
  loaderDeps: ({ search }) => ({ machine: search.machine, hours: search.last ?? 1 }),
  // If the server of the app itself is away for a moment, the page says so and keeps trying.
  loader: ({ deps }) => load(deps.machine, deps.hours).catch((error: unknown) => ({ values: null, error: String(error) })),
  component: Trulaser,
  pendingComponent: Loading,
})

function Trulaser() {
  const answer = Route.useLoaderData()
  const { last: hours = 1 } = Route.useSearch()
  const navigate = Route.useNavigate()
  const machine = answer.values?.values.machine ?? ""
  const live = useMemo<Live<TrulaserLive | null>>(
    () => ({
      filters: machine ? trulaserFilters(machine) : [],
      message: (state, topic, payload, now) => state && trulaserWith(state, topic, payload, now),
      at: (state, now) => state && trulaserAt(state, now),
    }),
    [machine],
  )
  const { values: state, connected } = useLive(answer.values, live)
  const readSeries = useReadSeries(machine, hours)
  useRetry(answer.values === null)

  if (answer.values === null || state === null) {
    return (
      <Page title="TruLaser">
        <NoAnswer error={answer.error ?? ""} />
      </Page>
    )
  }
  return (
    <Page title={trulaserTitle(state.values)} line={liveness(connected, state.values.asOf)}>
      <TrulaserCard
        values={state.values}
        timeline={state.timeline}
        hours={hours}
        onHours={(next) => void navigate({ search: (previous) => ({ ...previous, last: hoursOf(next) }) })}
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
