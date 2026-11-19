import type { CSSProperties, ReactNode } from "react"
import { Area, AreaChart, YAxis } from "recharts"

import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { ChartContainer } from "@pleiades/ui/components/chart"
import type { ChartConfig } from "@pleiades/ui/components/chart"
import { Meter } from "@pleiades/ui/components/meter"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import type { MachineEnergy } from "../energy/contract.ts"
import { categoryColour } from "../shared/colour.ts"
import type { MachineMeasurements, Measurement, MeasurementSeries } from "./contract.ts"
import { FEED_MOST, energy, measured, percent, power, poweredOn, rotating } from "./tiles.ts"
import { measuredValue } from "./words.ts"
import type { Written } from "./tiles.ts"

/** The power of the machine over the last minutes: one quantity of `genui_measurement_series`. */
type PowerSeries = MeasurementSeries["quantities"][number] & Pick<MeasurementSeries, "instants">

/**
 * The energy the meter of the machine counted over the hours of the page, from `genui_energy_show`:
 * undefined while it is asked for, null if it is not to be had.
 */
export type TileEnergy = { hours: number; machine: MachineEnergy } | null | undefined

/**
 * What one machine measures now, as tiles: its active power with the last minutes as a small graph,
 * its energy, its spindle and its feed, each large, with the values that belong to it below. A value
 * the machine has not measured leaves its line out, and a tile with nothing in it is left out. A value
 * that is not current says so on its tile.
 *
 * It draws a part of `genui_measurement_list`, of `genui_measurement_series` for the graph and of
 * `genui_energy_show` for the energy, and computes nothing but the wording.
 */
export function MeasurementTiles({ machine, series, energy: counted }: { machine: MachineMeasurements; series: PowerSeries | null; energy?: TileEnergy }) {
  const { measurements } = machine
  const of = (quantity: Measurement["quantity"]) => measured(measurements, quantity)
  const [activePower, imported, rotates, spindleOverride, bearing, feed, powerOn] = [
    of("activePower"),
    of("energyImported"),
    of("spindleRotating"),
    of("spindleOverride"),
    of("bearingTemperature"),
    of("feedOverride"),
    of("powerOnDuration"),
  ]
  const line = series?.lines.find((one) => one.machine === machine.machine) ?? null
  const tiles = [
    (activePower || line) && <PowerTile key="power" now={activePower} series={series} line={line} />,
    (imported || counted !== null) && <EnergyTile key="energy" counted={counted} imported={imported} />,
    (rotates || spindleOverride || bearing) && <SpindleTile key="spindle" rotates={rotates} override={spindleOverride} bearing={bearing} />,
    (feed || powerOn) && <FeedTile key="feed" feed={feed} powerOn={powerOn} />,
  ].filter(Boolean)
  // Four in a row where the room allows, two where it is narrower, one on a phone.
  return (
    <div className="@container/tiles">
      <div className="grid gap-3 @md/tiles:grid-cols-2 @3xl/tiles:grid-cols-4">{tiles}</div>
    </div>
  )
}

/** A tile: what it shows, its value large, and the values that belong to it. */
function Tile({ label, stale, value, children }: { label: string; stale: boolean; value: ReactNode; children?: ReactNode }) {
  return (
    <Card size="sm" className="gap-3">
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
        {stale && (
          <CardAction>
            <Badge variant="outline">not current</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className={stale ? "text-muted-foreground" : undefined}>{value}</div>
        {children}
      </CardContent>
    </Card>
  )
}

/** A value large, its unit small beside it. */
function Large({ written }: { written: Written | string }) {
  const { number, unit } = typeof written === "string" ? { number: written, unit: "" } : written
  return (
    <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
      {number}
      {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
    </p>
  )
}

/** The values that belong to the value of a tile, a line each. */
function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">{children}</dl>
}

function Fact({ label, one, text }: { label: string; one: Measurement | undefined; text: (one: Measurement) => string }) {
  if (!one) return null
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={one.stale ? "text-right text-muted-foreground tabular-nums" : "text-right font-medium tabular-nums"}>{text(one)}</dd>
    </>
  )
}

const POWER_CONFIG = { watt: { label: "Active power", color: categoryColour(0) } } satisfies ChartConfig

function PowerTile({ now, series, line }: { now: Measurement | undefined; series: PowerSeries | null; line: PowerSeries["lines"][number] | null }) {
  const rows = series && line ? series.instants.map((at, index) => ({ at, watt: typeof line.values[index] === "number" ? line.values[index] : null })) : []
  return (
    <Tile
      label="Active power"
      stale={now?.stale ?? true}
      value={now ? <Large written={power(now)} /> : <Large written="no value" />}
    >
      {/* What the value says now, the graph says over the last minutes; it is not read aloud. */}
      {rows.length > 0 && (
        <ChartContainer config={POWER_CONFIG} aria-hidden className="aspect-auto h-14 w-full">
          <AreaChart data={rows} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
            <YAxis hide domain={[0, "dataMax"]} />
            <Area
              dataKey="watt"
              type="monotone"
              stroke="var(--color-watt)"
              fill="var(--color-watt)"
              fillOpacity={0.15}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </Tile>
  )
}

/**
 * The energy over the hours of the page, from the meter, and what the meter counted in total. Where
 * the energy of the hours is not to be had, the tile shows the total alone.
 */
function EnergyTile({ counted, imported }: { counted: TileEnergy; imported: Measurement | undefined }) {
  const total = (one: Measurement) => (typeof one.value === "number" ? Object.values(energy(one.value, one.unit)).join(" ") : measuredValue(one))
  if (counted === null) {
    return (
      <Tile label="Energy imported in total" stale={imported?.stale ?? false} value={imported && <Large written={total(imported)} />} />
    )
  }
  const value = counted?.machine.energy
  return (
    <Tile
      label={counted ? `Energy, last ${counted.hours} h` : "Energy"}
      stale={false}
      value={
        counted === undefined ? (
          <Skeleton className="h-8 w-28" />
        ) : value && value.value !== null ? (
          <Large written={energy(value.value, value.unit)} />
        ) : (
          <p className="text-sm text-muted-foreground">Not known for these hours</p>
        )
      }
    >
      <Facts>
        <Fact label="Imported in total" one={imported} text={total} />
      </Facts>
    </Tile>
  )
}

function SpindleTile({ rotates, override, bearing }: { rotates: Measurement | undefined; override: Measurement | undefined; bearing: Measurement | undefined }) {
  return (
    <Tile
      label="Spindle 1"
      stale={rotates?.stale ?? false}
      value={<Large written={rotates ? rotating(rotates) : "—"} />}
    >
      <Facts>
        <Fact label="Override" one={override} text={percent} />
        <Fact label="Bearing temperature" one={bearing} text={measuredValue} />
      </Facts>
    </Tile>
  )
}

function FeedTile({ feed, powerOn }: { feed: Measurement | undefined; powerOn: Measurement | undefined }) {
  const fraction = feed && typeof feed.value === "number" && feed.unit === "one" ? feed.value : null
  return (
    <Tile
      label="Feed override"
      stale={feed?.stale ?? false}
      value={<Large written={feed ? apartPercent(percent(feed)) : "—"} />}
    >
      {fraction !== null && (
        <Meter
          aria-label="Feed override"
          // A reader of the screen hears the override, not how far the bar is filled.
          getAriaValueText={() => (feed ? percent(feed) : "")}
          value={Math.min(fraction, FEED_MOST)}
          min={0}
          max={FEED_MOST}
          className="[&_[data-slot=meter-indicator]]:bg-(--tile)"
          style={{ "--tile": categoryColour(0) } as CSSProperties}
        />
      )}
      <Facts>
        <Fact label="Powered on" one={powerOn} text={poweredOn} />
      </Facts>
    </Tile>
  )
}

/** "110 %" to 110 and %. */
function apartPercent(text: string): Written | string {
  return text.endsWith(" %") ? { number: text.slice(0, -2), unit: "%" } : text
}

/** A tile while its values are read: its frame and its label, and grey where its value and what belongs to it stand. */
function TileSkeleton({ children }: { children: ReactNode }) {
  return (
    <Card size="sm" className="gap-3">
      <CardHeader>
        <CardTitle className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-24" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <Skeleton className="h-7.5 w-28" />
        {children}
      </CardContent>
    </Card>
  )
}

/** A line of the values that belong to a tile, while it is read. */
function FactSkeleton() {
  return (
    <div className="flex h-5 items-center justify-between gap-3">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-3.5 w-12" />
    </div>
  )
}

/**
 * The tiles while what the machine measures is read: the four of a machine that measures all of them,
 * each with the room of what it holds, so they keep their place when the values come.
 */
export function MeasurementTilesSkeleton() {
  return (
    <div className="@container/tiles" aria-hidden>
      <div className="grid gap-3 @md/tiles:grid-cols-2 @3xl/tiles:grid-cols-4">
        <TileSkeleton>
          <Skeleton className="h-14 w-full" />
        </TileSkeleton>
        <TileSkeleton>
          <FactSkeleton />
        </TileSkeleton>
        <TileSkeleton>
          <div className="flex flex-col gap-1">
            <FactSkeleton />
            <FactSkeleton />
          </div>
        </TileSkeleton>
        <TileSkeleton>
          <Skeleton className="h-1.5 w-full rounded-full" />
          <FactSkeleton />
        </TileSkeleton>
      </div>
    </div>
  )
}
