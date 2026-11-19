import { useCallback, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@pleiades/ui/components/chart"
import type { ChartConfig } from "@pleiades/ui/components/chart"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@pleiades/ui/components/dialog"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@pleiades/ui/components/item"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { clock } from "@pleiades/cards/machine/format.ts"
import { clockWithSeconds } from "@pleiades/cards/measurement/words.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import type { ConditionKey, ConditionTile, TileStatus, TrulaserSeries } from "./contract.ts"
import { useRead } from "./use-read.ts"
import { shownNumber, signalText, tileValue } from "./words.ts"

/** Reads the values of one tile over time, for its chart. Null if they are not to be had. */
export type ReadSeries = (key: ConditionKey) => Promise<TrulaserSeries | null>

/** The sign of what the thresholds of a tile say: never colour alone, the sign has a shape and a name. */
function StatusSign({ status }: { status: TileStatus }) {
  if (status === "error") return <StateSymbol state="alarm" label="Threshold exceeded" />
  if (status === "warning") return <StateSymbol state="warning" label="Warning threshold reached" />
  if (status === "ok") return <StateSymbol state="running" label="Within thresholds" />
  return null
}

/**
 * The tiles of the condition guide: each value with its unit and what its thresholds say. A tile
 * opens a chart of its value over the hours its host reads, if the card can read one.
 */
export function ConditionGuide({ tiles, readSeries }: { tiles: ReadonlyArray<ConditionTile>; readSeries?: ReadSeries }) {
  const [open, setOpen] = useState<ConditionTile | null>(null)
  return (
    <>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))] gap-2">
        {tiles.map((tile) => (
          <li key={tile.key} className="flex">
            <Item
              variant="outline"
              size="sm"
              className="items-start text-left hover:bg-muted"
              render={readSeries ? <button type="button" /> : <div />}
              onClick={readSeries ? () => setOpen(tile) : undefined}
              aria-label={readSeries ? `${tile.label}: ${tileValue(tile)}. Open the chart.` : undefined}
            >
              <ItemContent className="gap-1">
                <ItemDescription className="text-xs font-medium tracking-wide uppercase">
                  {tile.label}
                  {tile.detail && tile.detail.value ? ` · ${signalText(tile.detail)}` : ""}
                </ItemDescription>
                <ItemTitle className="flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                  <StatusSign status={tile.status} />
                  {tileValue(tile)}
                </ItemTitle>
              </ItemContent>
            </Item>
          </li>
        ))}
      </ul>
      {readSeries && (
        <Dialog open={open !== null} onOpenChange={(opened) => !opened && setOpen(null)}>
          <DialogContent className="sm:max-w-3xl">
            {open && <TileChart tile={open} readSeries={readSeries} />}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

const config = { value: { label: "Value", color: "var(--chart-single)" } } satisfies ChartConfig

/** The chart of one tile: its value over the hours its host reads, read when the tile is opened. */
function TileChart({ tile, readSeries }: { tile: ConditionTile; readSeries: ReadSeries }) {
  const series: TrulaserSeries | null | undefined = useRead(useCallback(() => readSeries(tile.key), [readSeries, tile.key]))

  const unit = series ? shownNumber(0, series.unit, series.shown).unit : ""
  const rows = (series?.points ?? []).map((point) => ({
    at: Date.parse(point.at),
    value: Number(shownNumber(point.value, series?.unit ?? null, tile.shown).number),
  }))
  // A value holds until the next one: the line goes on to the end of the hours.
  const last = rows.at(-1)
  if (series && last) rows.push({ at: Date.parse(series.to), value: last.value })

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <StatusSign status={tile.status} />
          {tile.label}
          {tile.detail && tile.detail.value ? ` · ${signalText(tile.detail)}` : ""}
        </DialogTitle>
        <DialogDescription className="tabular-nums">
          Now {tileValue(tile)}
          {series && ` · ${clock(series.from)} to ${clock(series.to)} · ${series.points.length} values`}
        </DialogDescription>
      </DialogHeader>
      {series === undefined && <Skeleton className="h-72 w-full" />}
      {series === null && <p className="text-sm text-muted-foreground">The values could not be read.</p>}
      {series && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No value between {clock(series.from)} and {clock(series.to)}.
        </p>
      )}
      {series && rows.length > 0 && (
        <ChartContainer config={config} className="aspect-auto h-72 w-full">
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
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width="auto"
              domain={["auto", "auto"]}
              tickFormatter={(value: number) => `${value} ${unit}`.trim()}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  indicator="line"
                  labelFormatter={(_, payload) => {
                    const at = payload?.[0]?.payload?.at
                    return typeof at === "number" ? clockWithSeconds(at) : ""
                  }}
                  formatter={(value) => (
                    <span className="font-mono font-medium text-foreground tabular-nums">
                      {String(value)} {unit}
                    </span>
                  )}
                />
              }
            />
            <Line
              dataKey="value"
              type="stepAfter"
              stroke="var(--color-value)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
      )}
      <p className="text-xs break-words text-muted-foreground">From {tile.value.topic}</p>
    </>
  )
}
