import { useEffect, useId, useRef, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Button } from "@pleiades/ui/components/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@pleiades/ui/components/chart"
import type { ChartConfig } from "@pleiades/ui/components/chart"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@pleiades/ui/components/combobox"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@pleiades/ui/components/item"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { clock } from "../machine/format.ts"
import { labelOf } from "../machine/in-words.ts"
import { measuredValue, unitSign } from "../measurement/words.ts"
import { categoryColour } from "../shared/colour.ts"
import { MachineName } from "../shared/machine-name.tsx"
import { axisScale } from "../shared/scale.ts"
import { SmoothHeight } from "../shared/smooth-height.tsx"
import { MOST_LINES, MOST_UNITS, TIMESERIES_RANGES } from "./contract.ts"
import type { SeriesLine, SignalKind, TimeseriesRange, TimeseriesSeries, TimeseriesShow, TimeseriesSignals } from "./contract.ts"
import { NO_AXES, axesFor, lastValue, matchesSearch, nextColour } from "./view.ts"
import type { Axes } from "./view.ts"
import { rangeLabel, signalLabel, tickNumber } from "./words.ts"

/** Asks for the lines of the card: whoever draws the card passes it, the host or the application. Null if they are not to be had. */
export type AskSeries = (ask: { lines: Array<{ machine: string; signal: string }>; range: TimeseriesRange; to?: string }) => Promise<TimeseriesSeries | null>

/** Asks what a person can add: the signals of each machine. Null if they are not to be had. */
export type AskSignals = () => Promise<TimeseriesSignals | null>

/** A line the card draws: a pair of a machine and a signal, and its colour, `--chart-<colour>`. */
type Drawn = { machine: string; path: string; colour: number }

/** The width of a y axis, the same in the graph and beside the lanes, so the times line up. */
const AXIS_WIDTH = 48

/** The colour of a line: `--chart-<colour>`, from 1. */
const colourOf = (colour: number) => categoryColour(colour - 1)
const keyOf = (line: { colour: number }) => `l${line.colour}`
const same = (a: { machine: string; path: string }, b: { machine: string; path: string }) => a.machine === b.machine && a.path === b.path

/** "Last hour", "Last 15 minutes". */
const rangeTitle: Record<TimeseriesRange, string> = { "15m": "Last 15 minutes", "1h": "Last hour", "8h": "Last 8 hours", "24h": "Last 24 hours" }

/** What an axis is called: the sign of its unit, or the unit where it has none. */
const axisName = (unit: string) => unitSign(unit) || unit

/**
 * The time series card: signals of machines over a range, a line for each pair of a machine and a
 * signal. It draws the result of `genui_timeseries_show` and asks for its lines itself, with
 * `askSeries`, and again when a person changes the range or the lines: what it shows is a snapshot
 * as of the moment it was read. Numbers stand on two y axes at most, one unit each, a unit always
 * on the same side; a yes or no is a lane below. A line keeps its colour while others come and go.
 * The card computes nothing but the wording and where to place what the backend computed.
 */
export function TimeseriesCard({ values, askSeries, askSignals }: { values: TimeseriesShow; askSeries: AskSeries; askSignals: AskSignals }) {
  const [drawn, setDrawn] = useState<Array<Drawn>>(() => values.lines.map((line, index) => ({ machine: line.machine, path: line.path, colour: index + 1 })))
  const [range, setRange] = useState<TimeseriesRange>(values.range)
  // The first read ends where the words of the result end; every later one ends now.
  const [until, setUntil] = useState<string | undefined>(values.to)
  const [series, setSeries] = useState<TimeseriesSeries | null>()
  const [reading, setReading] = useState(false)
  const [notice, setNotice] = useState<string>()
  const axes = useRef<Axes>(NO_AXES)
  const sync = useId()

  // Lines that went from the card need no reading: what remains of the series is drawn as it is.
  const kept = useRef<{ asked: string; series: TimeseriesSeries } | null>(null)
  const asked = askedKey(drawn, range, until)
  useEffect(() => {
    if (kept.current?.asked === asked) {
      kept.current = null
      return
    }
    let wanted = true
    const [pairs, askedRange, askedUntil] = JSON.parse(asked) as [Array<[string, string]>, TimeseriesRange, string | null]
    setReading(true)
    askSeries({ lines: pairs.map(([machine, signal]) => ({ machine, signal })), range: askedRange, ...(askedUntil ? { to: askedUntil } : {}) }).then(
      (read) => {
        if (!wanted) return
        setReading(false)
        setSeries(read)
        if (read) placeUnits(read)
      },
      () => {
        if (!wanted) return
        setReading(false)
        setSeries(null)
      },
    )
    return () => {
      wanted = false
    }
    // `asked` says everything this reads.
  }, [asked])

  /** Puts the units of the lines read on the axes; a line of a unit with no axis left goes, and the card says why. */
  function placeUnits(read: TimeseriesSeries) {
    const units = read.lines.flatMap((line) => (line.kind === "number" && line.unit !== null ? [line.unit] : []))
    const placed = axesFor(axes.current, units)
    if (placed !== null) {
      axes.current = placed
      return
    }
    // Keep the units that have an axis, then the first of the others, up to two.
    const kept = [...new Set([axes.current.left, axes.current.right, ...units].filter((one): one is string => one !== null && units.includes(one)))].slice(0, MOST_UNITS)
    const dropped = read.lines.filter((line) => line.kind === "number" && line.unit !== null && !kept.includes(line.unit))
    axes.current = axesFor(axes.current, kept) ?? NO_AXES
    remove(read, (line) => dropped.some((one) => same(one, line)))
    const names = dropped.map((one) => `${signalLabel(one.path)} of ${labelOf(one.machine)} (${axisName(one.unit ?? "")})`)
    setNotice(`${names.join(", ")}: this card has two axes, ${kept.map(axisName).join(" and ")}. Remove the lines of one of them first.`)
  }

  /**
   * Takes lines from the card. What was read of the others stays, with its instants and its end, and
   * is not read again.
   */
  function remove(read: TimeseriesSeries | null | undefined, goes: (line: Drawn) => boolean) {
    const remaining = drawn.filter((line) => !goes(line))
    if (read) {
      const series = { ...read, lines: read.lines.filter((line) => remaining.some((one) => same(one, line))) }
      kept.current = { asked: askedKey(remaining, range, until), series }
      setSeries(series)
    }
    setDrawn(remaining)
  }

  const change = (next: () => void) => {
    next()
    setUntil(undefined)
    setNotice(undefined)
  }
  const colours = drawn.map((line) => line.colour)
  const free = nextColour(colours)
  const shown = series ?? undefined
  const lines = drawn.flatMap((line) => {
    const read = shown?.lines.find((one) => same(one, line))
    return read ? [{ ...line, read }] : []
  })
  return (
    <Card size="sm">
      {/* The range stands right of the title; where the card is too narrow for both, below it, still on the right. */}
      <CardHeader className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">Time series</CardTitle>
        <CardAction className="ml-auto">
          <RangeChoice range={range} onChange={(next) => change(() => setRange(next))} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SmoothHeight>
          <div className="flex flex-col gap-3" aria-busy={reading}>
            <TimeseriesGraph series={series} lines={lines} axes={axes.current} sync={sync} />
            <Lanes series={shown} lines={lines} axes={axes.current} sync={sync} />
          </div>
        </SmoothHeight>
        <Legend
          drawn={drawn}
          series={shown}
          axes={axes.current}
          onRemove={
            drawn.length > 1
              ? (line) => {
                  setNotice(undefined)
                  remove(series, (one) => same(one, line))
                }
              : undefined
          }
        />
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        <AddLine
          drawn={drawn}
          askSignals={askSignals}
          full={free === null}
          onAdd={(pair) => {
            if (free !== null) change(() => setDrawn((all) => [...all, { ...pair, colour: free }]))
          }}
        />
      </CardContent>
    </Card>
  )
}

/** What the card asks for, as one text: the lines, the range and where it ends. An effect sees a change of it. */
function askedKey(drawn: ReadonlyArray<Drawn>, range: TimeseriesRange, until: string | undefined): string {
  return JSON.stringify([drawn.map((line) => [line.machine, line.path]), range, until ?? null])
}

/** The range, one of four. Changing it reads the lines again, up to now. */
function RangeChoice({ range, onChange }: { range: TimeseriesRange; onChange: (range: TimeseriesRange) => void }) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="Range"
      value={[range]}
      onValueChange={(chosen) => {
        const next = TIMESERIES_RANGES.find((one) => one === chosen[0])
        if (next !== undefined && next !== range) onChange(next)
      }}
    >
      {TIMESERIES_RANGES.map((one) => (
        <ToggleGroupItem key={one} value={one} aria-label={rangeTitle[one]} className="px-2.5">
          {rangeLabel[one]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** A drawn line with what was read of it. */
type ReadLine = Drawn & { read: SeriesLine }

/** Which axis a line of numbers stands on. */
const sideOf = (line: ReadLine, axes: Axes): "left" | "right" => (line.read.unit !== null && line.read.unit === axes.right ? "right" : "left")

/** The rows of a graph: one for each instant of the series, with the value of each line there. */
function rowsOf(series: TimeseriesSeries, lines: ReadonlyArray<ReadLine>, asNumber: (value: number | boolean | null | undefined) => number | null) {
  return series.instants.map((at, index) => ({
    at: Date.parse(at),
    ...Object.fromEntries(lines.map((line) => [keyOf(line), asNumber(line.read.values[index])])),
  }))
}

/** The numbers, on one or two y axes, each labelled with its unit. */
function TimeseriesGraph({ series, lines, axes, sync }: { series: TimeseriesSeries | null | undefined; lines: ReadonlyArray<ReadLine>; axes: Axes; sync: string }) {
  if (series === undefined) return <Skeleton className="h-48 w-full" />
  if (series === null) return <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">The lines could not be read.</p>
  const numbers = lines.filter((line) => line.read.kind === "number" && line.read.unit !== null && line.read.note === null)
  if (numbers.length === 0) {
    if (lines.some((line) => line.read.kind === "yesNo")) return null
    return <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">No line has a value in this range.</p>
  }
  const config = Object.fromEntries(
    numbers.map((line) => [keyOf(line), { label: `${labelOf(line.machine)} · ${signalLabel(line.path)}`, color: colourOf(line.colour) }]),
  ) satisfies ChartConfig
  const unitOf = new Map(numbers.map((line) => [keyOf(line), line.read.unit]))
  const rows = rowsOf(series, numbers, (value) => (typeof value === "number" ? value : null))
  const scaleOf = (side: "left" | "right") =>
    axisScale(numbers.filter((line) => sideOf(line, axes) === side).flatMap((line) => line.read.values.map((value) => (typeof value === "number" ? value : null))))
  const left = axes.left !== null ? scaleOf("left") : null
  const right = axes.right !== null ? scaleOf("right") : null
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span>{axes.left !== null && `${axisName(axes.left)}, left axis`}</span>
        <span>{axes.right !== null && `${axisName(axes.right)}, right axis`}</span>
      </figcaption>
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <LineChart accessibilityLayer data={rows} syncId={sync} margin={{ left: 0, right: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="at"
            type="number"
            scale="time"
            domain={[Date.parse(series.from), Date.parse(series.to)]}
            tickFormatter={(at: number) => clock(new Date(at).toISOString())}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
          />
          {/* Each axis follows the values on it, with round ticks around them, not from zero. */}
          <YAxis
            yAxisId="left"
            orientation="left"
            hide={axes.left === null}
            width={AXIS_WIDTH}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            domain={left ? left.domain : ["auto", "auto"]}
            ticks={left?.ticks}
            tickFormatter={(value: number) => tickNumber(value, axes.left, left?.step)}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            hide={axes.right === null}
            width={AXIS_WIDTH}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            domain={right ? right.domain : ["auto", "auto"]}
            ticks={right?.ticks}
            tickFormatter={(value: number) => tickNumber(value, axes.right, right?.step)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_, payload) => {
                  const at = payload?.[0]?.payload?.at
                  return typeof at === "number" ? clock(new Date(at).toISOString()) : ""
                }}
                formatter={(value, name, item) => (
                  <>
                    <div className="w-1 shrink-0 self-stretch rounded-[2px]" style={{ background: item.color }} />
                    <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                      <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {measuredValue({ value: Number(value), unit: unitOf.get(String(name)) ?? null })}
                      </span>
                    </div>
                  </>
                )}
              />
            }
          />
          {numbers.map((line) => (
            <Line
              key={keyOf(line)}
              yAxisId={sideOf(line, axes)}
              dataKey={keyOf(line)}
              // A value holds until the next one: the line steps, it does not slope.
              type="stepAfter"
              stroke={`var(--color-${keyOf(line)})`}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </figure>
  )
}

/** A lane for each yes or no: up while yes, down while no, none where the machine was silent. */
function Lanes({ series, lines, axes, sync }: { series: TimeseriesSeries | undefined; lines: ReadonlyArray<ReadLine>; axes: Axes; sync: string }) {
  const lanes = lines.filter((line) => line.read.kind === "yesNo" && line.read.note === null)
  if (series === undefined || lanes.length === 0) return null
  // The lanes leave the room of the y axes free, so their times stand under those of the graph.
  const room = { marginLeft: axes.left !== null ? AXIS_WIDTH : 0, marginRight: axes.right !== null ? AXIS_WIDTH : 0 }
  return (
    <div className="flex flex-col gap-1.5">
      {lanes.map((line) => {
        const config = { [keyOf(line)]: { label: `${labelOf(line.machine)} · ${signalLabel(line.path)}`, color: colourOf(line.colour) } } satisfies ChartConfig
        const rows = rowsOf(series, [line], (value) => (typeof value === "boolean" ? Number(value) : null))
        return (
          <div key={keyOf(line)} style={room}>
            <p className="text-xs text-muted-foreground">
              {labelOf(line.machine)} · {signalLabel(line.path)}, yes or no
            </p>
            <ChartContainer config={config} className="aspect-auto h-5 w-full">
              <LineChart data={rows} syncId={sync} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                <XAxis dataKey="at" type="number" scale="time" domain={[Date.parse(series.from), Date.parse(series.to)]} hide />
                <YAxis domain={[0, 1]} hide />
                <Line dataKey={keyOf(line)} type="stepAfter" stroke={`var(--color-${keyOf(line)})`} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ChartContainer>
          </div>
        )
      })}
    </div>
  )
}

/** What a line says beside its name: its signal, and its axis or why it draws nothing. */
function described(line: Drawn, read: SeriesLine | undefined, axes: Axes): string {
  const signal = signalLabel(line.path)
  if (read === undefined) return signal
  if (read.note === "text") return `${signal} · a text, no line`
  if (read.note === "noValues") return `${signal} · no value in this range`
  if (read.kind === "yesNo") return `${signal} · yes or no, a lane below`
  if (read.unit === null) return signal
  return `${signal} · ${axisName(read.unit)}, ${read.unit === axes.right ? "right" : "left"} axis`
}

/** The newest value a line has in the range, in its unit, and "not current" where the machine fell silent since. */
function newestOf(read: SeriesLine | undefined): { text: string; current: boolean } | null {
  const last = read === undefined ? null : lastValue(read.values)
  if (read === undefined || last === null) return null
  return { text: measuredValue({ value: last.value, unit: read.unit }), current: last.current }
}

/** The newest value of a line as the legend writes it. */
function Newest({ newest, className }: { newest: { text: string; current: boolean }; className: string }) {
  if (newest.current) return <span className={className}>{newest.text}</span>
  return (
    <span className={`${className} text-muted-foreground`}>
      {newest.text}, not current
    </span>
  )
}

/** The lines of the card: colour, machine, signal and axis, the newest value, and the way to take one away. */
function Legend({
  drawn,
  series,
  axes,
  onRemove,
}: {
  drawn: ReadonlyArray<Drawn>
  series: TimeseriesSeries | undefined
  axes: Axes
  onRemove: ((line: Drawn) => void) | undefined
}) {
  return (
    <ItemGroup className="@container/legend gap-1">
      {drawn.map((line) => {
        const read = series?.lines.find((one) => same(one, line))
        const newest = newestOf(read)
        return (
          <Item key={keyOf(line)} size="xs" variant="outline" className="flex-nowrap">
            <ItemMedia>
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: colourOf(line.colour) }} />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="min-w-0 font-medium">
                <MachineName id={line.machine} />
              </ItemTitle>
              <ItemDescription>{described(line, read, axes)}</ItemDescription>
              {/* Where the card is narrow, the value stands under the signal, and only the way to remove the line on the right. */}
              {newest !== null && <Newest newest={newest} className="text-sm tabular-nums @sm/legend:hidden" />}
            </ItemContent>
            <ItemActions className="ml-auto gap-1">
              {newest !== null && <Newest newest={newest} className="hidden text-sm whitespace-nowrap tabular-nums @sm/legend:inline" />}
              {onRemove && (
                <Button variant="ghost" size="xs" aria-label={`Remove ${signalLabel(line.path)} of ${line.machine}`} onClick={() => onRemove(line)}>
                  Remove
                </Button>
              )}
            </ItemActions>
          </Item>
        )
      })}
    </ItemGroup>
  )
}

/** How many signals the list shows at most; typing narrows it. */
const SHOWN_SIGNALS = 50

/** A signal a person can add, with what the list searches in. */
type Choice = { machine: string; path: string; kind: SignalKind; key: string }

/** Adds a line: a list of every signal of every machine, to search by machine or signal. */
function AddLine({
  drawn,
  askSignals,
  full,
  onAdd,
}: {
  drawn: ReadonlyArray<Drawn>
  askSignals: AskSignals
  full: boolean
  onAdd: (pair: { machine: string; path: string }) => void
}) {
  const [signals, setSignals] = useState<TimeseriesSignals | null>()
  // Every time the list opens it asks again: after a failure, and for machines that began to publish since.
  const [opened, setOpened] = useState(0)
  useEffect(() => {
    if (opened === 0) return
    let wanted = true
    setSignals((before) => (before === null ? undefined : before))
    askSignals().then(
      (read) => wanted && setSignals(read),
      () => wanted && setSignals(null),
    )
    return () => {
      wanted = false
    }
  }, [opened, askSignals])
  if (full) return <p className="text-xs text-muted-foreground">A card draws {MOST_LINES} lines at most. Remove one to add another.</p>
  const groups = (signals?.machines ?? [])
    .map((one) => ({
      machine: one.machine,
      items: one.signals
        .filter((signal) => !drawn.some((line) => same(line, { machine: one.machine, path: signal.path })))
        .map((signal): Choice => ({ machine: one.machine, path: signal.path, kind: signal.kind, key: `${one.machine} ${signal.path}` })),
    }))
    .filter((group) => group.items.length > 0)
  return (
    <Combobox
      items={groups}
      value={null}
      itemToStringValue={(choice: Choice) => `${choice.machine} ${signalLabel(choice.path)}`}
      filter={(choice: Choice, query: string) => matchesSearch([choice.machine, signalLabel(choice.path), choice.path], query)}
      // The first signals that match what was typed, not every signal of every machine at once.
      limit={SHOWN_SIGNALS}
      onOpenChange={(open) => open && setOpened((count) => count + 1)}
      onValueChange={(choice: Choice | null) => {
        if (choice) onAdd({ machine: choice.machine, path: choice.path })
      }}
    >
      <ComboboxInput placeholder="Add a line: search a machine or a signal" aria-label="Add a line" />
      <ComboboxContent>
        <ComboboxEmpty>{signals === undefined ? "Reading the signals…" : signals === null ? "The signals could not be read." : "No signal found."}</ComboboxEmpty>
        <ComboboxList>
          {(group: (typeof groups)[number]) => (
            <ComboboxGroup key={group.machine} items={group.items}>
              <ComboboxLabel>
                <MachineName id={group.machine} />
              </ComboboxLabel>
              <ComboboxCollection>
                {(choice: Choice) => (
                  <ComboboxItem key={choice.key} value={choice}>
                    <span className="min-w-0 flex-1">
                      {signalLabel(choice.path)}
                      <span className="block truncate text-xs text-muted-foreground">
                        {choice.path}
                        {choice.kind === "yesNo" && ", yes or no"}
                      </span>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
