import { Fragment } from "react"
import type { CSSProperties } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@pleiades/ui/components/chart"
import type { ChartConfig } from "@pleiades/ui/components/chart"
import { Meter } from "@pleiades/ui/components/meter"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { clock } from "../machine/format.ts"
import type { EnergySeries, EnergyShow, MachineEnergy } from "./contract.ts"
import { axisKilowatts, inKilowattHours, kilowattHours, kilowatts } from "./words.ts"

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
 */
export function EnergyCard({ from, to, hours, machines, series }: EnergyShow & { series?: Lines }) {
  const colours = new Map(machines.map((one, index) => [one.machine, colourOf(index)]))
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">Power and energy</CardTitle>
        <CardDescription>
          {hours === 1 ? "Last hour" : `Last ${hours} hours`}, {clock(from)} to {clock(to)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {machines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No machine published active power or its energy meter between {clock(from)} and {clock(to)}.
          </p>
        ) : (
          <>
            <PowerGraph series={series} colours={colours} />
            <EnergyTable machines={machines} colours={colours} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * A machine id that breaks only after `_` and `-`, never inside a word:
 * alcyone-machines_AX-400_P-04 becomes alcyone-|machines_|AX-|400_|P-04 where the cell is narrow.
 */
function MachineName({ id }: { id: string }) {
  return (
    <span className="min-w-0 whitespace-normal">
      {id.split(/(?<=[_-])/).map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
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
  if (power.meanWatt !== null && power.peakWatt !== null) {
    return (
      <>
        <span className="text-muted-foreground">mean</span> {kilowatts(power.meanWatt)}
        <span className="block text-xs text-muted-foreground">peak {kilowatts(power.peakWatt)}</span>
      </>
    )
  }
  return <span className="text-muted-foreground">{power.unit !== null && power.unit !== "watt" ? `in ${power.unit}` : "no value"}</span>
}

/**
 * The machines with their energy as a meter against the one that imported the most, and mean and
 * peak power. Energy and power stand in columns of their own where the card is wide, and under the
 * name where it is narrow. The meters compare kilowatt hours: the display converts, so machines in
 * two units of energy still compare.
 */
function EnergyTable({ machines, colours }: { machines: ReadonlyArray<MachineEnergy>; colours: Map<string, string> }) {
  const kilowattHoursOf = (one: MachineEnergy) => (one.energy.value === null ? null : inKilowattHours(one.energy.value, one.energy.unit))
  const most = Math.max(0, ...machines.map((one) => kilowattHoursOf(one) ?? 0))
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
        <TableBody>
          {machines.map((one) => {
            const { machine, energy, power } = one
            const kwh = kilowattHoursOf(one)
            return (
              <TableRow key={machine}>
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
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/** Why the energy of a machine is not known, in a few words. */
function meterNote(energy: MachineEnergy["energy"]): string {
  if (energy.meterWentBack) return "meter reset"
  if (energy.start && energy.end && energy.start.unit !== energy.end.unit) return "meter changed unit"
  if (energy.unit !== null && inKilowattHours(0, energy.unit) === null) return `meter in ${energy.unit}`
  return "no meter"
}

/** The active power of each machine over the hours of the card, a line for each. */
function PowerGraph({ series, colours }: { series: Lines; colours: Map<string, string> }) {
  if (series === undefined) return <Skeleton className="h-48 w-full" />
  if (series === null || series.lines.length === 0) return null
  const keyOf = (machine: string) => `m${[...colours.keys()].indexOf(machine)}`
  const lines = series.lines.filter((line) => colours.has(line.machine))
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
            domain={["auto", "auto"]}
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
