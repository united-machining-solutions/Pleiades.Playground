import { useState } from "react"
import type { CSSProperties } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@pleiades/ui/components/chart"
import type { ChartConfig } from "@pleiades/ui/components/chart"
import { Meter } from "@pleiades/ui/components/meter"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { clock } from "../machine/format.ts"
import { categoryColour } from "../shared/colour.ts"
import { MachineName } from "../shared/machine-name.tsx"
import { axisScale } from "../shared/scale.ts"
import { SmoothHeight } from "../shared/smooth-height.tsx"
import { timeTicks } from "../shared/time-ticks.ts"
import type { EnergySeries, EnergyShow, MachineEnergy } from "./contract.ts"
import { Pages } from "../shared/pages.tsx"
import { ENERGY_ORDERS, pageOf } from "./order.ts"
import type { EnergyOrder, EnergyPage } from "./order.ts"
import { axisKilowatts, cardRange, inKilowattHours, kilowattHours, kilowatts, number } from "./words.ts"

/** The colour of a machine: its place in the result, the same in the graph and in the table. */
const colourOf = categoryColour

/** The lines of the graph: undefined while they are asked for, null if they are not to be had. */
export type Lines = EnergySeries | null | undefined

/**
 * The energy card: how much energy each machine imported over the last hours, from its meter, with
 * mean and peak power, and above it the power of each machine as a graph. It draws the result of
 * `genui_energy_show`, and of `genui_energy_series` for the graph, which whoever draws the card
 * asks for and hands in as `series`. It computes nothing but the wording; on the wire energy is in
 * the unit of the meter and power in watt, and the card writes kilowatt hours and kilowatts.
 *
 * A person chooses the order and turns the pages, five machines on one; the graph draws the
 * machines of the page. The result stays whole: order and page are the state of the card, and what
 * they compute is in order.ts. A machine keeps the colour of its place in the result on every page.
 *
 * `bare` draws it without its frame and its head, for a page that puts it into a card of its own,
 * and without the meters: a page of one machine has nothing to compare them with. The hours then
 * stand in the head of the column of the energy.
 */
export function EnergyCard({ from, to, hours, machines, series, bare = false }: EnergyShow & { series?: Lines; bare?: boolean }) {
  const colours = new Map(machines.map((one, index) => [one.machine, colourOf(index)]))
  const [order, setOrder] = useState<EnergyOrder>("energy")
  const [page, setPage] = useState(1)
  const view = pageOf(machines, order, page)
  // The meters compare with the one that imported the most of all, so a page does not change them.
  const most = Math.max(0, ...machines.map((one) => kilowattHoursOf(one) ?? 0))
  const content =
        machines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No machine published active power or its energy meter between {clock(from)} and {clock(to)}.
          </p>
        ) : (
          <>
            {machines.length > 1 && (
              <OrderChoice
                order={order}
                onChange={(next) => {
                  setOrder(next)
                  setPage(1)
                }}
              />
            )}
            <PowerGraph series={series} colours={colours} shown={view.machines.map((one) => one.machine)} />
            <SmoothHeight>
              <EnergyTable machines={view.machines} colours={colours} most={most} hours={hours} meters={!bare} turn={`${order}:${view.page}`} />
            </SmoothHeight>
            {view.pages > 1 && <EnergyPages view={view} onPage={setPage} />}
          </>
        )
  if (bare) return <div className="flex flex-col gap-4">{content}</div>
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">Power and energy</CardTitle>
        <CardDescription>{cardRange(from, to, hours)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{content}</CardContent>
    </Card>
  )
}

/** What each order is called on its toggle. */
const orderLabel: Record<EnergyOrder, string> = { energy: "Energy", mean: "Mean", peak: "Peak", name: "Name" }

/** What each order does, for a reader of the screen. */
const orderSaid: Record<EnergyOrder, string> = {
  energy: "Most energy first",
  mean: "Highest mean power first",
  peak: "Highest peak power first",
  name: "By machine id, A to Z",
}

/** The order of the machines, one of four. */
function OrderChoice({ order, onChange }: { order: EnergyOrder; onChange: (order: EnergyOrder) => void }) {
  return (
    // Where the card is very narrow, the toggles share its width and their words get smaller.
    <div className="@container/order flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-xs text-muted-foreground">Order by</span>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        className="w-full @xs/order:w-fit"
        aria-label="Order of the machines"
        value={[order]}
        onValueChange={(chosen) => {
          const next = ENERGY_ORDERS.find((one) => one === chosen[0])
          if (next !== undefined && next !== order) onChange(next)
        }}
      >
        {ENERGY_ORDERS.map((one) => (
          <ToggleGroupItem
            key={one}
            value={one}
            aria-label={orderSaid[one]}
            className="min-w-0 flex-1 px-1 text-xs @xs/order:flex-none @xs/order:px-2.5 @xs/order:text-sm"
          >
            {orderLabel[one]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** Where the page lies among all machines, and the way to the others. The card does not navigate. */
function EnergyPages({ view, onPage }: { view: EnergyPage; onPage: (page: number) => void }) {
  return (
    <Pages page={view.page} pages={view.pages} onPage={onPage}>
      <p className="text-xs text-muted-foreground tabular-nums">
        {view.first}–{view.last} of {view.total}
      </p>
    </Pages>
  )
}

/** The energy of a machine in kilowatt hours, for the meters: the display converts. */
function kilowattHoursOf(one: MachineEnergy): number | null {
  return one.energy.value === null ? null : inKilowattHours(one.energy.value, one.energy.unit)
}

/** The energy of a machine in kilowatt hours, the number alone under its head, or why it is not known. */
function EnergyValue({ energy, withUnit = false }: { energy: MachineEnergy["energy"]; withUnit?: boolean }) {
  if (energy.value === null) return <span className="text-muted-foreground">{meterNote(energy)}</span>
  const written = kilowattHours(energy.value, energy.unit)
  return <>{withUnit ? written : written.replace(/ kWh$/, "")}</>
}

/** Why a machine has no power to show: its power is in a unit that is not watt, or it has none. */
function noPower(power: MachineEnergy["power"]): string {
  return power.unit !== null && power.unit !== "watt" ? `in ${power.unit}` : "no value"
}

/** A power in kilowatts, the number alone under its head, or a word where there is none. */
function Kilowatts({ watt, none, withUnit = false }: { watt: number | null; none: string; withUnit?: boolean }) {
  if (watt === null) return <span className="text-muted-foreground">{none}</span>
  return <>{withUnit ? kilowatts(watt) : number(watt / 1000, 2)}</>
}

/** Where the card is narrow, mean and peak stand together under the name. */
function PowerValue({ power }: { power: MachineEnergy["power"] }) {
  if (power.meanWatt === null && power.peakWatt === null) return <span className="text-muted-foreground">{noPower(power)}</span>
  return (
    <>
      {power.meanWatt !== null && (
        <>
          <span className="text-muted-foreground">avg</span> {kilowatts(power.meanWatt)}
        </>
      )}
      {power.peakWatt !== null ? (
        <span className="block text-xs text-muted-foreground">peak {kilowatts(power.peakWatt)}</span>
      ) : (
        power.error !== null && <span className="block text-xs text-muted-foreground">peak not known</span>
      )}
    </>
  )
}

/**
 * The machines with their energy as a meter against the one that imported the most, its kilowatt
 * hours, and mean and peak power. Where the card is wide, the meter, the energy and the powers stand
 * in columns of their own, the units in the heads; where it is narrow, they stand under the name. The
 * meters compare kilowatt hours: the display converts, so machines in two units of energy still
 * compare. Without `meters`, the table has no column of them.
 */
function EnergyTable({
  machines,
  colours,
  most,
  hours,
  meters,
  turn,
}: {
  machines: ReadonlyArray<MachineEnergy>
  colours: Map<string, string>
  most: number
  hours: number
  meters: boolean
  /** The order and page shown: when it changes, the rows of the new page fade in. */
  turn: string
}) {
  const wide = "hidden @lg/energy:table-cell"
  const last = hours === 1 ? "the last hour" : `the last ${hours} h`
  return (
    <div className="@container/energy">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={meters ? undefined : "w-full"}>Machine</TableHead>
            {meters && <TableHead className={`${wide} w-full`}>Energy in {last}</TableHead>}
            <TableHead className={`${wide} text-right`}>{meters ? "kWh" : `kWh, last ${hours} h`}</TableHead>
            <TableHead className={`${wide} text-right`}>Avg kW</TableHead>
            <TableHead className={`${wide} text-right`}>Peak kW</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody key={turn} className="motion-safe:animate-card-fade-in">
          {machines.map((one) => (
            <EnergyRow key={one.machine} one={one} colours={colours} most={meters ? most : 0} hours={meters ? null : hours} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * One machine in the table. Without a most to compare with, it has no meter; `hours`, where the
 * table has no meters, says the hours after the energy where the card is narrow.
 */
function EnergyRow({ one, colours, most, hours }: { one: MachineEnergy; colours: Map<string, string>; most: number; hours: number | null }) {
  const { machine, energy, power } = one
  const kwh = kilowattHoursOf(one)
  const meter = kwh !== null && most > 0 && (
    <Meter
      aria-label={`Energy of ${machine} against the most`}
      value={kwh}
      min={0}
      max={most}
      className="[&_[data-slot=meter-indicator]]:bg-(--machine) [&_[data-slot=meter-track]]:h-2.5"
      style={{ "--machine": colours.get(machine) } as CSSProperties}
    />
  )
  const wide = "hidden @lg/energy:table-cell"
  return (
    <TableRow>
      <TableCell className="whitespace-normal @max-lg/energy:w-full">
        <div className="flex gap-2 font-medium">
          <span aria-hidden className="mt-1.5 size-2.5 shrink-0 self-start rounded-full" style={{ background: colours.get(machine) }} />
          <MachineName id={machine} />
        </div>
        <div className="flex flex-col gap-1.5 @lg/energy:hidden">
          {meter && <div className="mt-1.5">{meter}</div>}
          <div className="flex items-start justify-between gap-4 tabular-nums">
            <span className="whitespace-nowrap">
              <EnergyValue energy={energy} withUnit />
              {hours !== null && <span className="text-muted-foreground">, last {hours} h</span>}
            </span>
            <span className="text-right whitespace-nowrap">
              <PowerValue power={power} />
            </span>
          </div>
        </div>
      </TableCell>
      {hours === null && <TableCell className={`${wide} min-w-32`}>{meter}</TableCell>}
      <TableCell className={`${wide} text-right tabular-nums`}>
        <EnergyValue energy={energy} />
      </TableCell>
      <TableCell className={`${wide} text-right tabular-nums`}>
        <Kilowatts watt={power.meanWatt} none={noPower(power)} />
      </TableCell>
      <TableCell className={`${wide} text-right tabular-nums`}>
        <Kilowatts watt={power.peakWatt} none={power.error !== null ? "not known" : noPower(power)} />
      </TableCell>
    </TableRow>
  )
}

/** Why the energy of a machine is not known, in a few words. */
function meterNote(energy: MachineEnergy["energy"]): string {
  if (energy.meterWentBack) return "meter reset"
  if (energy.start && energy.end && energy.start.unit !== energy.end.unit) return "meter changed unit"
  if (energy.unit !== null && inKilowattHours(0, energy.unit) === null) return `meter in ${energy.unit}`
  return "no meter"
}

/** The active power of the machines shown over the hours of the card, a line for each. */
function PowerGraph({ series, colours, shown }: { series: Lines; colours: Map<string, string>; shown: ReadonlyArray<string> }) {
  if (series === undefined) return <Skeleton className="h-56 w-full" />
  if (series === null) return null
  if (!series.lines.some((line) => shown.includes(line.machine))) {
    return (
      <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No machine of this page published active power in these hours.
      </p>
    )
  }
  const keyOf = (machine: string) => `m${[...colours.keys()].indexOf(machine)}`
  const lines = series.lines.filter((line) => shown.includes(line.machine))
  // The axis spans the machines of every page, so it stands still when the pages turn.
  // Machines that stand still get an axis from 0 to a kilowatt.
  const scale = axisScale(series.lines.filter((line) => colours.has(line.machine)).flatMap((line) => line.watt), { zeroSpan: 1_000 })
  const config = Object.fromEntries(
    lines.map((line) => [keyOf(line.machine), { label: line.machine, color: colours.get(line.machine) }]),
  ) satisfies ChartConfig
  // Every line has the same instants: a row for each, with the power of each machine.
  const rows = series.instants.map((at, index) => ({
    at: Date.parse(at),
    ...Object.fromEntries(lines.map((line) => [keyOf(line.machine), line.watt[index] ?? null])),
  }))
  const [from, to] = [Date.parse(series.from), Date.parse(series.to)]
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs text-muted-foreground">Active power, kW</figcaption>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <AreaChart accessibilityLayer data={rows} margin={{ left: 0, right: 12 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="at"
            type="number"
            scale="time"
            domain={[from, to]}
            ticks={timeTicks(from, to)}
            tickFormatter={(at: number) => clock(new Date(at).toISOString())}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
          />
          {/* The axis follows the values shown, with round ticks around them, not from zero. */}
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width="auto"
            domain={scale ? scale.domain : ["auto", "auto"]}
            ticks={scale?.ticks}
            tickFormatter={axisKilowatts}
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
                      <span className="font-mono font-medium text-foreground tabular-nums">{kilowatts(Number(value))}</span>
                    </div>
                  </>
                )}
              />
            }
          />
          {lines.map((line) => (
            <Area
              key={line.machine}
              dataKey={keyOf(line.machine)}
              type="linear"
              stroke={`var(--color-${keyOf(line.machine)})`}
              fill={`var(--color-${keyOf(line.machine)})`}
              fillOpacity={lines.length === 1 ? 0.15 : 0.06}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </figure>
  )
}
