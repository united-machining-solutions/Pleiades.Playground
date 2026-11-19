import { clock } from "@pleiades/cards/machine/format.ts"
import { labelOf } from "@pleiades/cards/machine/in-words.ts"
import type { MachineMeasurements, MeasurementSeries } from "@pleiades/cards/measurement/contract.ts"
import { MeasurementGraph } from "@pleiades/cards/measurement/measurement-graph.tsx"
import { quantityLabel } from "@pleiades/cards/measurement/words.ts"
import { MOST_LINES } from "@pleiades/cards/timeseries/contract.ts"
import type { SeriesLine, TimeseriesSeries } from "@pleiades/cards/timeseries/contract.ts"
import { signalLabel } from "@pleiades/cards/timeseries/words.ts"
import { Button } from "@pleiades/ui/components/button"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@pleiades/ui/components/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { createFileRoute } from "@tanstack/react-router"
import { GaugeIcon, Maximize2Icon } from "lucide-react"
import { memo, useMemo } from "react"
import type { ReactNode } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { liveAt, livePageOf, liveWith, measurementFilters } from "@/live/measurements.ts"
import type { LivePage } from "@/live/measurements.ts"
import { graphsOf, nowNextToTitle } from "@/live/shown.ts"
import { signalFilters, signalsAt, signalsPageOf, signalsWith, silentNow } from "@/live/signals.ts"
import type { SignalsPage } from "@/live/signals.ts"
import { getMeasurementSeries, getMeasurements, getTimeseriesSeries, getTimeseriesSignals } from "@/machines/get-machines.ts"

/** The graphs are read once, from the backend; then every value comes from the broker, and the graphs move on with the clock. */
const live: Live<LivePage> = { filters: measurementFilters(), message: liveWith, at: liveAt }

/** What every machine measured over the last minutes, a graph for each value, live from the broker. */
export const Route = createFileRoute("/live")({
  staticData: { nav: { title: "Live values", icon: GaugeIcon } },
  // The machine whose lines the graphs show, in the address, so that a link keeps it. Without one, all.
  validateSearch: (search): { machine?: string } =>
    typeof search.machine === "string" && search.machine !== "" ? { machine: search.machine } : {},
  // A chosen machine is read again: every signal it has is found anew.
  loaderDeps: ({ search }) => ({ machine: search.machine }),
  // If the server of the app itself is away for a moment, the page says so and keeps trying.
  loader: async ({ deps }) => {
    const failed = (error: unknown) => ({ values: null, error: String(error) })
    const [series, current, signals] = await Promise.all([
      getMeasurementSeries().catch(failed),
      getMeasurements().catch(failed),
      deps.machine === undefined ? null : signalsOf(deps.machine),
    ])
    return { series, current, signals }
  },
  component: LiveValues,
  pendingComponent: Loading,
})

/**
 * The lines of every signal a machine published in the last 24 hours, over the last 15 minutes, as
 * the backend lists them: the tool draws so many lines at most at once, so they are asked for in
 * parts, each up to now by the clock of the server. Each answer has instants of its own; the page
 * puts them on the same slots (`signalsPageOf`). Null if the machine has none, or they are not to be had.
 */
async function signalsOf(machine: string): Promise<Array<TimeseriesSeries> | null> {
  try {
    const listed = await getTimeseriesSignals()
    const paths = listed?.machines.find((one) => one.machine === machine)?.signals.map((signal) => signal.path) ?? []
    if (paths.length === 0) return null
    const parts = Array.from({ length: Math.ceil(paths.length / MOST_LINES) }, (_, index) =>
      paths.slice(index * MOST_LINES, (index + 1) * MOST_LINES),
    )
    const answers = await Promise.all(
      parts.map((part) => getTimeseriesSeries({ data: { lines: part.map((signal) => ({ machine, signal })), range: "15m" } })),
    )
    return answers.every((answer): answer is TimeseriesSeries => answer !== null) ? answers : null
  } catch {
    return null
  }
}

/** How the signals of a chosen machine are kept live; without one, there are none. */
function signalsLive(machine: string | undefined): Live<SignalsPage | null> {
  return {
    filters: machine === undefined ? [] : signalFilters(machine),
    message: (page, topic, payload, now) => page && signalsWith(page, topic, payload, now),
    at: (page, now) => page && signalsAt(page, now),
  }
}

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
  // With a machine chosen, every signal it has, live as the graphs of all machines.
  const signalsPage = useMemo(
    () => (chosen !== undefined && loaded.signals ? signalsPageOf(chosen, loaded.signals) : null),
    [loaded, chosen],
  )
  const signalsLiveness = useMemo(() => signalsLive(chosen), [chosen])
  const { values: signals } = useLive(signalsPage, signalsLiveness)

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
  // With a machine chosen, a graph for each of its signals that has a value; one without any keeps the graphs above.
  const signalLines = signals?.series.lines.filter((line) => line.values.some((value) => value !== null) || signals.newest[line.topic]) ?? []

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
      {signals !== null && signalLines.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,28rem),1fr))] gap-3">
          {signalLines.map((line) => (
            <SignalGraph key={line.topic} line={line} page={signals} machines={machines} />
          ))}
        </div>
      ) : graphs.length === 0 ? (
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

/**
 * The graph of one signal of the chosen machine, under its name and with its newest value. A number
 * without a unit is a plain number, not a yes or no.
 */
function SignalGraph({ line, page, machines }: { line: SeriesLine; page: SignalsPage; machines: ReadonlyArray<string> }) {
  const { from, to, instants } = page.series
  const unit = line.kind === "yesNo" ? null : (line.unit ?? "one")
  const newest = page.newest[line.topic]
  const title = signalLabel(line.path)
  return (
    <Enlargeable title={title}>
      {(enlarged) => (
        <MeasurementGraph
          series={{ quantity: line.path, unit, lines: [line], from, to, instants }}
          title={title}
          machines={machines}
          current={
            newest === undefined
              ? []
              : [{ machine: line.machine, measurements: [{ quantity: line.path, value: newest.value, unit, stale: silentNow(page) }] }]
          }
          {...enlarged}
        />
      )}
    </Enlargeable>
  )
}

/**
 * A graph with a button at its top right that shows it enlarged, over the page. The enlarged graph has
 * an X at its top right that closes it, and the page is as it was. Both stay live.
 */
function Enlargeable({ title, children }: { title: string; children: (enlarged: { action?: ReactNode; large?: boolean }) => ReactNode }) {
  return (
    <Dialog>
      {children({
        action: (
          <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Enlarge ${title}`} />}>
            <Maximize2Icon />
          </DialogTrigger>
        ),
      })}
      <DialogContent className="gap-0 p-0 sm:max-w-[min(calc(100%-2rem),80rem)]">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children({ large: true })}
      </DialogContent>
    </Dialog>
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
      <Enlargeable title={quantityLabel[quantity.quantity]}>
        {(enlarged) => (
          <MeasurementGraph
            series={{ ...quantity, lines: quantity.lines.filter((line) => shown.includes(line.machine)), from, to, instants }}
            // Every machine, chosen or not, so that each keeps its colour.
            machines={machines}
            // With all machines at most one value of now stands next to the title (live/shown.ts).
            current={nowNextToTitle(current, shown, quantity.quantity, chosen)}
            {...enlarged}
          />
        )}
      </Enlargeable>
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
