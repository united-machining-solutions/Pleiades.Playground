import { clock } from "@pleiades/cards/machine/format.ts"
import { MeasurementGraph } from "@pleiades/cards/measurement/measurement-graph.tsx"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { createFileRoute } from "@tanstack/react-router"
import { GaugeIcon } from "lucide-react"
import { useMemo } from "react"
import type { ReactNode } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { liveAt, livePageOf, liveWith, measurementFilters } from "@/live/measurements.ts"
import type { LivePage } from "@/live/measurements.ts"
import { getMeasurementSeries, getMeasurements } from "@/machines/get-machines.ts"

/** The graphs are read once, from the backend; then every value comes from the broker, and the graphs move on with the clock. */
const live: Live<LivePage> = { filters: measurementFilters(), message: liveWith, at: liveAt }

/** What every machine measured over the last minutes, a graph for each value, live from the broker. */
export const Route = createFileRoute("/live")({
  staticData: { nav: { title: "Live values", icon: GaugeIcon } },
  // The machine whose lines the graphs show, in the address, so that a link keeps it. Without one, all.
  validateSearch: (search): { machine?: string } =>
    typeof search.machine === "string" && search.machine !== "" ? { machine: search.machine } : {},
  // If the server of the app itself is away for a moment, the page says so and keeps trying.
  loader: async () => {
    const failed = (error: unknown) => ({ values: null, error: String(error) })
    const [series, current] = await Promise.all([
      getMeasurementSeries().catch(failed),
      getMeasurements().catch(failed),
    ])
    return { series, current }
  },
  component: LiveValues,
  pendingComponent: Loading,
})

/** What the choice of all machines is called in the address of the toggle group. */
const ALL = "all"

function LiveValues() {
  const loaded = Route.useLoaderData()
  const { machine: chosen } = Route.useSearch()
  const navigate = Route.useNavigate()
  // What the backend read when the page was opened: the graphs of the last minutes and the values of then.
  const page = useMemo(() => livePageOf(loaded.series.values, loaded.current.values), [loaded])
  const { values, connected } = useLive(page, live)
  useRetry(loaded.series.values === null)
  const { series, current } = values

  if (series === null) {
    return (
      <Page>
        <NoAnswer error={loaded.series.error ?? ""} />
      </Page>
    )
  }

  // The values of now stand next to the titles. Without them the graphs still stand.
  const now = current?.machines ?? []
  // Every machine of the page in one order, so that it keeps its colour in every graph.
  const machines = [
    ...new Set([...now.map((one) => one.machine), ...series.quantities.flatMap((one) => one.lines.map((line) => line.machine))]),
  ].sort()

  if (machines.length === 0) {
    return (
      <Page>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GaugeIcon />
            </EmptyMedia>
            <EmptyTitle>No machines</EmptyTitle>
            <EmptyDescription>No machine has published a value in the last 24 hours.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Page>
    )
  }

  const { from, to, instants, quantities } = series
  // A machine that is no longer there, from an old link, shows as none: the choice says so.
  const shown = chosen === undefined ? machines : machines.filter((one) => one === chosen)
  const choose = (machine: string | undefined) =>
    void navigate({ search: (previous) => ({ ...previous, machine }), replace: true })

  return (
    <Page
      line={`${shown.length} of ${machines.length} ${machines.length === 1 ? "machine" : "machines"} · ${connected ? "live" : "not live, no connection to the broker"} · ${clock(from)} to ${clock(to)}`}
    >
      <ToggleGroup
        variant="outline"
        value={[chosen ?? ALL]}
        // One choice at a time: a click on the one that is chosen keeps it.
        onValueChange={(value) => {
          const [next] = value
          if (next !== undefined) choose(next === ALL ? undefined : next)
        }}
        aria-label="Machines to show"
        className="flex-wrap"
      >
        <ToggleGroupItem value={ALL}>All machines</ToggleGroupItem>
        {machines.map((machine) => (
          <ToggleGroupItem key={machine} value={machine}>
            {machine}
          </ToggleGroupItem>
        ))}
        {chosen !== undefined && !machines.includes(chosen) && (
          <ToggleGroupItem value={chosen} disabled>
            {chosen}, no data
          </ToggleGroupItem>
        )}
      </ToggleGroup>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,28rem),1fr))] gap-3">
        {quantities.map((one) => (
          <MeasurementGraph
            key={one.quantity}
            series={{ ...one, lines: one.lines.filter((line) => shown.includes(line.machine)), from, to, instants }}
            // Every machine, chosen or not, so that each keeps its colour.
            machines={machines}
            current={now.filter((measured) => shown.includes(measured.machine))}
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
        <h1 className="text-2xl font-semibold">Live values</h1>
        {line && <p className="text-sm text-muted-foreground">{line}</p>}
      </div>
      {children}
    </div>
  )
}

function Loading() {
  return (
    <Page>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,28rem),1fr))] gap-3">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </Page>
  )
}
