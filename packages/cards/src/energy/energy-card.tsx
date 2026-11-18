import { Fragment, useEffect, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@pleiades/ui/components/chart"
import type { ChartConfig } from "@pleiades/ui/components/chart"
import { Meter } from "@pleiades/ui/components/meter"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@pleiades/ui/components/pagination"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { clock } from "../machine/format.ts"
import type { EnergySeries, EnergyShow, MachineEnergy } from "./contract.ts"
import { ENERGY_ORDERS, pageLinks, pageOf } from "./order.ts"
import { powerScale } from "./scale.ts"
import type { EnergyOrder, EnergyPage } from "./order.ts"
import { axisKilowatts, cardRange, inKilowattHours, kilowattHours, kilowatts, machineIdPieces } from "./words.ts"

/** How many machines the categorical colours of the theme name, `--chart-1` and on. */
const COLOURS = 14

/** The colour of a machine: its place in the result, the same in the graph and in the table. */
const colourOf = (index: number) => `var(--chart-${(index % COLOURS) + 1})`

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
 */
export function EnergyCard({ from, to, hours, machines, series }: EnergyShow & { series?: Lines }) {
  const colours = new Map(machines.map((one, index) => [one.machine, colourOf(index)]))
  const [order, setOrder] = useState<EnergyOrder>("energy")
  const [page, setPage] = useState(1)
  const view = pageOf(machines, order, page)
  // The meters compare with the one that imported the most of all, so a page does not change them.
  const most = Math.max(0, ...machines.map((one) => kilowattHoursOf(one) ?? 0))
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">Power and energy</CardTitle>
        <CardDescription>
          {cardRange(from, to, hours)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {machines.length === 0 ? (
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
              <EnergyTable machines={view.machines} colours={colours} most={most} turn={`${order}:${view.page}`} />
            </SmoothHeight>
            {view.pages > 1 && <EnergyPages view={view} onPage={setPage} />}
          </>
        )}
      </CardContent>
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
  const go = (page: number) => (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (page >= 1 && page <= view.pages && page !== view.page) onPage(page)
  }
  const off = (disabled: boolean) => (disabled ? { "aria-disabled": true, tabIndex: -1, className: "pointer-events-none opacity-50" } : {})
  return (
    <div className="@container/pages flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        {view.first}–{view.last} of {view.total}
      </p>
      {/* Where the card is narrow, the links leave out the neighbours of the current page. */}
      <Pagination className="mx-0 w-auto hidden @sm/pages:flex">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" onClick={go(view.page - 1)} {...off(view.page === 1)} />
          </PaginationItem>
          {pageLinks(view.page, view.pages, 1).map((one, index) =>
            one === "gap" ? (
              <PaginationItem key={`gap-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={one}>
                <PaginationLink href="#" isActive={one === view.page} onClick={go(one)}>
                  {one}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext href="#" onClick={go(view.page + 1)} {...off(view.page === view.pages)} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <Pagination className="mx-0 w-auto @sm/pages:hidden">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" onClick={go(view.page - 1)} {...off(view.page === 1)} />
          </PaginationItem>
          {pageLinks(view.page, view.pages, 0).map((one, index) =>
            one === "gap" ? (
              <PaginationItem key={`gap-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={one}>
                <PaginationLink href="#" isActive={one === view.page} onClick={go(one)}>
                  {one}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext href="#" onClick={go(view.page + 1)} {...off(view.page === view.pages)} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

/** The energy of a machine in kilowatt hours, for the meters: the display converts. */
function kilowattHoursOf(one: MachineEnergy): number | null {
  return one.energy.value === null ? null : inKilowattHours(one.energy.value, one.energy.unit)
}

/**
 * A machine id that breaks only after `_`, never inside a model or a serial number: a browser
 * would break after a hyphen by itself, so each piece holds together.
 */
function MachineName({ id }: { id: string }) {
  return (
    <span className="min-w-0 whitespace-normal">
      {machineIdPieces(id).map((piece, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          <span className="whitespace-nowrap">{piece}</span>
        </Fragment>
      ))}
    </span>
  )
}

/** The energy of a machine in kilowatt hours, or why it is not known. */
function EnergyValue({ energy }: { energy: MachineEnergy["energy"] }) {
  if (energy.value !== null) return <>{kilowattHours(energy.value, energy.unit)}</>
  return <span className="text-muted-foreground">{meterNote(energy)}</span>
}

/** Mean and peak power of a machine, or why there are none. */
function PowerValue({ power }: { power: MachineEnergy["power"] }) {
  if (power.meanWatt === null && power.peakWatt === null) {
    return <span className="text-muted-foreground">{power.unit !== null && power.unit !== "watt" ? `in ${power.unit}` : "no value"}</span>
  }
  return (
    <>
      {power.meanWatt !== null && (
        <>
          <span className="text-muted-foreground">mean</span> {kilowatts(power.meanWatt)}
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
 * The machines with their energy as a meter against the one that imported the most, and mean and
 * peak power. Energy and power stand in columns of their own where the card is wide, and under the
 * name where it is narrow. The meters compare kilowatt hours: the display converts, so machines in
 * two units of energy still compare.
 */
function EnergyTable({
  machines,
  colours,
  most,
  turn,
}: {
  machines: ReadonlyArray<MachineEnergy>
  colours: Map<string, string>
  most: number
  /** The order and page shown: when it changes, the rows of the new page fade in. */
  turn: string
}) {
  return (
    <div className="@container/energy">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Machine</TableHead>
            <TableHead className="hidden text-right @sm/energy:table-cell">Energy</TableHead>
            <TableHead className="hidden text-right @sm/energy:table-cell">Power</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody key={turn} className="motion-safe:animate-card-fade-in">
          {machines.map((one) => (
            <EnergyRow key={one.machine} one={one} colours={colours} most={most} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Eases to the height of what it holds when that changes, instead of jumping: a page with fewer
 * machines grows or shrinks the card in a fifth of a second. Without motion it jumps.
 */
function SmoothHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  useEffect(() => {
    const held = inner.current
    if (!held) return
    const observer = new ResizeObserver(() => setHeight(held.offsetHeight))
    observer.observe(held)
    return () => observer.disconnect()
  }, [])
  return (
    <div className="overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none" style={{ height }}>
      <div ref={inner}>{children}</div>
    </div>
  )
}

/** One machine in the table. */
function EnergyRow({ one, colours, most }: { one: MachineEnergy; colours: Map<string, string>; most: number }) {
  const { machine, energy, power } = one
  const kwh = kilowattHoursOf(one)
  return (
    <TableRow>
      <TableCell className="w-full whitespace-normal">
        <div className="flex gap-2 font-medium">
          <span aria-hidden className="mt-1.5 size-2.5 shrink-0 self-start rounded-full" style={{ background: colours.get(machine) }} />
          <MachineName id={machine} />
        </div>
        {kwh !== null && most > 0 && (
          <Meter
            aria-label={`Energy of ${machine} against the most`}
            value={kwh}
            min={0}
            max={most}
            className="mt-1.5 [&_[data-slot=meter-indicator]]:bg-(--machine)"
            style={{ "--machine": colours.get(machine) } as CSSProperties}
          />
        )}
        <div className="mt-1.5 flex items-start justify-between gap-4 tabular-nums @sm/energy:hidden">
          <span className="whitespace-nowrap">
            <EnergyValue energy={energy} />
          </span>
          <span className="text-right whitespace-nowrap">
            <PowerValue power={power} />
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden text-right tabular-nums @sm/energy:table-cell">
        <EnergyValue energy={energy} />
      </TableCell>
      <TableCell className="hidden text-right tabular-nums @sm/energy:table-cell">
        <PowerValue power={power} />
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
  if (series === undefined) return <Skeleton className="h-48 w-full" />
  if (series === null) return null
  if (!series.lines.some((line) => shown.includes(line.machine))) {
    return (
      <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No machine of this page published active power in these hours.
      </p>
    )
  }
  const keyOf = (machine: string) => `m${[...colours.keys()].indexOf(machine)}`
  const lines = series.lines.filter((line) => shown.includes(line.machine))
  // The axis spans the machines of every page, so it stands still when the pages turn.
  const scale = powerScale(series.lines.filter((line) => colours.has(line.machine)))
  const config = Object.fromEntries(
    lines.map((line) => [keyOf(line.machine), { label: line.machine, color: colours.get(line.machine) }]),
  ) satisfies ChartConfig
  // Every line has the same instants: a row for each, with the power of each machine.
  const rows = series.instants.map((at, index) => ({
    at: Date.parse(at),
    ...Object.fromEntries(lines.map((line) => [keyOf(line.machine), line.watt[index] ?? null])),
  }))
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs text-muted-foreground">Active power, kW</figcaption>
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <LineChart accessibilityLayer data={rows} margin={{ left: 0, right: 12 }}>
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
            <Line
              key={line.machine}
              dataKey={keyOf(line.machine)}
              type="linear"
              stroke={`var(--color-${keyOf(line.machine)})`}
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
