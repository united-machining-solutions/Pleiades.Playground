import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { createFileRoute } from "@tanstack/react-router"
import { ChartColumnIcon, FactoryIcon } from "lucide-react"
import type { ReactNode } from "react"

import { HISTORY_MS, StateHistoryTile, StateTotalsTile } from "@/charts/state-tiles.tsx"
import { NoAnswer } from "@/components/no-answer.tsx"
import { liveness, useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { chartsAt, chartsWith, machineFilters } from "@/live/machines.ts"
import type { ChartsPage } from "@/live/machines.ts"
import { getCharts } from "@/machines/get-machines.ts"

/** The page is read once, from the backend; then every value of every machine comes from the broker. */
const live: Live<ChartsPage | null> = {
  filters: machineFilters(),
  message: (page, topic, payload, now) => page && chartsWith(page, topic, payload, now),
  at: (page, now) => page && chartsAt(page, now),
}

/**
 * Charts: the last hours of every machine, as charts. What needs a person now is Home's question;
 * this page shows how the hours went.
 */
export const Route = createFileRoute("/charts")({
  // The entry in the sidebar; the breadcrumb calls the page by its title.
  staticData: { nav: { title: "Charts", icon: ChartColumnIcon } },
  // One call of the server for the whole page, which asks the backend over one connection.
  loader: () => getCharts({ data: HISTORY_MS }).catch((error: unknown) => ({ values: null, error: String(error) })),
  component: Charts,
  pendingComponent: Loading,
})

function Charts() {
  const answer = Route.useLoaderData()
  const { values: page, connected } = useLive<ChartsPage | null>(answer.values, live)
  useRetry(answer.values === null)

  if (answer.values === null || page === null) {
    return (
      <Page>
        <NoAnswer error={answer.error ?? ""} />
      </Page>
    )
  }

  const { asOf, machines } = page
  if (machines.length === 0) {
    return (
      <Page>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FactoryIcon />
            </EmptyMedia>
            <EmptyTitle>No machines</EmptyTitle>
            <EmptyDescription>No machine has published a value in the last 24 hours.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Page>
    )
  }

  return (
    <Page line={`${machines.length} ${machines.length === 1 ? "machine" : "machines"} · ${liveness(connected, asOf)}`}>
      <StateTotalsTile shows={machines.map((one) => one.show)} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
        {machines.map(({ show, from, spans }) => (
          <StateHistoryTile
            key={show.machine.machine}
            machine={show.machine.machine}
            from={from}
            to={show.history.to}
            spans={spans}
          />
        ))}
      </div>
    </Page>
  )
}

function Page({ line, children }: { line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Charts</h1>
        {line && <p className="text-sm text-muted-foreground">{line}</p>}
      </div>
      {children}
    </div>
  )
}

function Loading() {
  return (
    <Page>
      <Skeleton className="h-72 w-full" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </Page>
  )
}
