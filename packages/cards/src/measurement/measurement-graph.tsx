import { memo } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@pleiades/ui/components/chart"
import type { ChartConfig } from "@pleiades/ui/components/chart"
import { clock } from "../machine/format.ts"
import { labelOf } from "../machine/in-words.ts"
import { categoryColour } from "../shared/colour.ts"
import type { MachineMeasurements, MeasurementSeries } from "./contract.ts"
import { axisNumber, clockWithSeconds, measuredValue, quantityLabel, unitSign } from "./words.ts"

/** One quantity of the result, with the minutes the result is about and the instants of its lines. */
type QuantitySeries = MeasurementSeries["quantities"][number] & Pick<MeasurementSeries, "from" | "to" | "instants">


/**
 * The graph of one quantity: a line for each machine over the last minutes, with what each
 * machine measures now next to the title. It draws a part of the result of
 * `genui_measurement_series`, and of `genui_measurement_list` for the values of now, and computes
 * nothing but the wording.
 *
 * `machines` names every machine of the page in a fixed order: a machine keeps its colour in every
 * graph, also in one where it has no line.
 */
export function MeasurementGraph({
  series,
  machines,
  current,
}: {
  series: QuantitySeries
  machines: ReadonlyArray<string>
  current: ReadonlyArray<MachineMeasurements>
}) {
  const { quantity, unit, lines } = series
  const now = current.flatMap((one) => {
    const measured = one.measurements.find((measurement) => measurement.quantity === quantity)
    return measured ? [{ machine: one.machine, measured }] : []
  })
  const sign = unitSign(unit)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">
          {quantityLabel[quantity]}
          {sign && <span className="font-normal text-muted-foreground">, {sign}</span>}
        </CardTitle>
        {now.length > 0 && (
          <CardDescription className="tabular-nums">
            {now.map(({ machine, measured }, index) => (
              <span key={machine}>
                {index > 0 && " · "}
                {labelOf(machine)} <span className={measured.stale ? undefined : "text-foreground"}>{measuredValue(measured)}</span>
                {measured.stale && " (not current)"}
              </span>
            ))}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No machine published this value between {clock(series.from)} and {clock(series.to)}.
          </p>
        ) : (
          <Lines series={series} machines={machines} />
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The lines of a graph. A page that is live draws its graphs again whenever a value of now changes;
 * the lines are drawn again only when they, their minutes or the machines changed, which is far less
 * often, and drawing them is what takes the time.
 */
const Lines = memo(
  function Lines({ series, machines }: { series: QuantitySeries; machines: ReadonlyArray<string> }) {
    const { unit, lines } = series
    const yesOrNo = unit === null
    const keyOf = (machine: string) => `m${machines.indexOf(machine)}`
    const config = Object.fromEntries(
      lines.map((line) => [
        keyOf(line.machine),
        { label: labelOf(line.machine), color: categoryColour(machines.indexOf(line.machine)) },
      ]),
    ) satisfies ChartConfig

    // Every line has the same instants: a row for each, with the value of each machine. A yes or no
    // is drawn as 1 or 0.
    const rows = series.instants.map((at, index) => ({
      at: Date.parse(at),
      ...Object.fromEntries(
        lines.map((line) => {
          const value = line.values[index] ?? null
          return [keyOf(line.machine), typeof value === "boolean" ? Number(value) : value]
        }),
      ),
    }))
    const valueText = (value: number) => (yesOrNo ? (value ? "yes" : "no") : measuredValue({ value, unit }))

    return (
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
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            // As wide as the longest number: an energy meter has many digits.
            width="auto"
            domain={yesOrNo ? [0, 1] : ["auto", "auto"]}
            ticks={yesOrNo ? [0, 1] : undefined}
            tickFormatter={(value: number) => (yesOrNo ? (value ? "yes" : "no") : axisNumber(value, unit))}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_, payload) => {
                  const at = payload?.[0]?.payload?.at
                  return typeof at === "number" ? clockWithSeconds(at) : ""
                }}
                formatter={(value, name, item) => (
                  <>
                    <div className="w-1 shrink-0 self-stretch rounded-[2px]" style={{ background: item.color }} />
                    <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                      <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
                      <span className="font-mono font-medium text-foreground tabular-nums">{valueText(Number(value))}</span>
                    </div>
                  </>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {lines.map((line) => (
            <Line
              key={line.machine}
              dataKey={keyOf(line.machine)}
              type={yesOrNo ? "stepAfter" : "monotone"}
              stroke={`var(--color-${keyOf(line.machine)})`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    )
  },
  (before, after) =>
    before.series.from === after.series.from &&
    before.series.to === after.series.to &&
    before.series.unit === after.series.unit &&
    before.series.instants === after.series.instants &&
    before.series.lines.length === after.series.lines.length &&
    before.series.lines.every((line, index) => line === after.series.lines[index]) &&
    before.machines.join() === after.machines.join(),
)
