import { clock } from "@pleiades/cards/machine/format.ts"
import { labelOf } from "@pleiades/cards/machine/in-words.ts"
import type { MachineMeasurements, MeasurementSeries } from "@pleiades/cards/measurement/contract.ts"
import { MeasurementGraph } from "@pleiades/cards/measurement/measurement-graph.tsx"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { createFileRoute } from "@tanstack/react-router"
import { GaugeIcon } from "lucide-react"
import { memo, useMemo } from "react"
import type { ReactNode } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { liveAt, livePageOf, liveWith, measurementFilters } from "@/live/measurements.ts"
import type { LivePage } from "@/live/measurements.ts"
import { graphsOf, nowNextToTitle } from "@/live/shown.ts"
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
  // With all machines, only the graphs that have a line: a value no machine published is left out.
  const graphs = graphsOf(quantities, chosen)

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
          <ToggleGroupItem key={machine} value={machine} aria-label={machine}>
            {labelOf(machine)}
          </ToggleGroupItem>
        ))}
        {chosen !== undefined && !machines.includes(chosen) && (
          <ToggleGroupItem value={chosen} disabled>
            {labelOf(chosen)}, no data
          </ToggleGroupItem>
        )}
      </ToggleGroup>
      {graphs.length === 0 ? (
        // Machines are there, and none of them published one of the values this page draws.
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GaugeIcon />
            </EmptyMedia>
            <EmptyTitle>No values to draw</EmptyTitle>
            <EmptyDescription>No machine has published one of the values this page draws, such as its active power.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,28rem),1fr))] gap-3">
          {graphs.map((one) => (
            <QuantityGraph
              key={one.quantity}
              quantity={one}
              from={from}
              to={to}
              instants={instants}
              machines={machines}
              shown={shown}
              chosen={chosen}
              current={now}
            />
          ))}
        </div>
      )}
    </Page>
  )
}

type QuantityGraphProps = {
  quantity: MeasurementSeries["quantities"][number]
  from: string
  to: string
  instants: MeasurementSeries["instants"]
  machines: ReadonlyArray<string>
  shown: ReadonlyArray<string>
  /** The machine the person chose, or undefined for all of them. */
  chosen: string | undefined
  current: ReadonlyArray<MachineMeasurements>
}

/** What the title of a graph says now: the value of its quantity at each machine. */
function nowOf(current: ReadonlyArray<MachineMeasurements>, quantity: string): string {
  return current
    .map((one) => {
      const measured = one.measurements.find((measurement) => measurement.quantity === quantity)
      return measured ? `${one.machine}=${String(measured.value)}|${measured.at}|${measured.stale}` : ""
    })
    .join(";")
}

/**
 * One graph. A message or a tick of the clock changes one quantity at a time, or none: a graph
 * whose line, hours and values of now stay as they were is not drawn again, and one whose values of
 * now changed draws its title again but not its lines (`MeasurementGraph`). Drawing all of them for
 * every message kept the browser busy most of the time.
 */
const QuantityGraph = memo(
  function QuantityGraph({ quantity, from, to, instants, machines, shown, chosen, current }: QuantityGraphProps) {
    return (
      <MeasurementGraph
        series={{ ...quantity, lines: quantity.lines.filter((line) => shown.includes(line.machine)), from, to, instants }}
        // Every machine, chosen or not, so that each keeps its colour.
        machines={machines}
        // With all machines at most one value of now stands next to the title (live/shown.ts).
        current={nowNextToTitle(current, shown, quantity.quantity, chosen)}
      />
    )
  },
  (before, after) =>
    before.quantity === after.quantity &&
    before.from === after.from &&
    before.to === after.to &&
    before.instants === after.instants &&
    before.machines.join() === after.machines.join() &&
    before.shown.join() === after.shown.join() &&
    before.chosen === after.chosen &&
    nowOf(before.current, before.quantity.quantity) === nowOf(after.current, after.quantity.quantity),
)

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
