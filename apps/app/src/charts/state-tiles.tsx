import type { MachineShow, Span, State } from "@pleiades/cards/machine/contract.ts"
import { clock, lasting } from "@pleiades/cards/machine/format.ts"
import { stateLabel, stateOrder } from "@pleiades/cards/machine/state.ts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@pleiades/ui/components/chart"
import type { ChartConfig } from "@pleiades/ui/components/chart"
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

// The tiles of the page Charts, a chart each. The colours of the states are those of the card
// catalogue, the same in every brand; a state is always named next to its colour, in the legend, on
// the axis and in the tooltip.

const stateConfig = Object.fromEntries(
  stateOrder.map((state) => [state, { label: stateLabel[state], color: `var(--state-${state})` }]),
) satisfies ChartConfig

/** Bar chart: how long each machine was in each state over the last hours, one bar per machine. */
export function StateTotalsTile({ shows }: { shows: ReadonlyArray<MachineShow> }) {
  const first = shows[0]
  if (!first) return null
  // Seconds, as the backend gives them: the axis and the tooltip write them as hours and minutes.
  const rows = shows.map((show) => ({
    machine: show.machine.machine,
    ...Object.fromEntries(show.history.totals.map((total) => [total.state, total.seconds])),
  }))
  const hours = Math.round((Date.parse(first.history.to) - Date.parse(first.history.from)) / 3_600_000)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Time per state</CardTitle>
        <CardDescription>
          Last {hours} hours, {clock(first.history.from)} to {clock(first.history.to)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={stateConfig} className="aspect-auto h-56 w-full">
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 8 }} barCategoryGap={12}>
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              domain={[0, hours * 3600]}
              ticks={Array.from({ length: hours + 1 }, (_, hour) => hour * 3600).filter((_, hour) => hour % 2 === 0)}
              tickFormatter={(seconds: number) => `${seconds / 3600} h`}
              tickLine={false}
              axisLine={false}
            />
            <YAxis type="category" dataKey="machine" width={48} tickLine={false} axisLine={false} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span>{stateLabel[name as State]}</span>
                      <span className="font-semibold tabular-nums">{lasting(Number(value) * 1000)}</span>
                    </div>
                  )}
                />
              }
            />
            {/* The legend reads the states in the order of the bars, not by name. */}
            <ChartLegend
              content={<ChartLegendContent />}
              itemSorter={(item) => stateOrder.indexOf(item.dataKey as State)}
            />
            {stateOrder.map((state) => (
              <Bar
                key={state}
                dataKey={state}
                stackId="states"
                fill={`var(--color-${state})`}
                // The 2 px gap of the surface between two segments.
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

/** The states from bottom to top: what needs a person most lies lowest. */
const levels: ReadonlyArray<State> = ["no-data", "alarm", "stopped", "setup", "running"]

/** How far back the step line reaches: the page asks for the spans of this much time only. */
export const HISTORY_MS = 30 * 60_000

const historyConfig = { level: { label: "State", color: "var(--chart-single)" } } satisfies ChartConfig

/** History: the state of one machine over the last 30 minutes, as a step line. */
export function StateHistoryTile({
  machine,
  from,
  to,
  spans,
}: {
  machine: string
  from: string
  to: string
  spans: ReadonlyArray<Span> | null
}) {
  // The machines change their state every minute or two: over hours a step line turns into a
  // barcode. So the line shows the last half hour of the spans, and starts where that half hour does.
  const end = Date.parse(to)
  const start = Math.max(Date.parse(from), end - HISTORY_MS)
  const shown = (spans ?? []).filter((span) => Date.parse(span.to) > start)
  const last = shown.at(-1)
  const points = [
    ...shown.map((span) => ({ at: Math.max(Date.parse(span.from), start), level: levels.indexOf(span.state) })),
    ...(last ? [{ at: Date.parse(last.to), level: levels.indexOf(last.state) }] : []),
  ]
  const ticks = Array.from({ length: 4 }, (_, index) => start + ((end - start) * index) / 3)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{machine}</CardTitle>
        <CardDescription>
          State history, last 30 minutes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {spans === null || points.length === 0 ? (
          <p className="text-sm text-muted-foreground">The states of the last 30 minutes could not be read.</p>
        ) : (
          <ChartContainer config={historyConfig} className="aspect-auto h-48 w-full">
            <LineChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                type="number"
                dataKey="at"
                scale="time"
                domain={[start, end]}
                ticks={ticks}
                tickFormatter={(at: number) => clock(new Date(at).toISOString())}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="number"
                domain={[0, levels.length - 1]}
                ticks={levels.map((_, index) => index)}
                tickFormatter={(index: number) => stateLabel[levels[index] ?? "no-data"]}
                width={64}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, payload) => {
                      const at = payload[0]?.payload as { at: number } | undefined
                      return at ? `from ${clock(new Date(at.at).toISOString())}` : ""
                    }}
                    formatter={(value) => (
                      <span className="font-semibold">{stateLabel[levels[Number(value)] ?? "no-data"]}</span>
                    )}
                  />
                }
              />
              <Line
                dataKey="level"
                type="stepAfter"
                stroke="var(--color-level)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
