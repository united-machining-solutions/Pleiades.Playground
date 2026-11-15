import type { State } from "@pleiades/cards/machine/contract.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Badge } from "@pleiades/ui/components/badge"
import { ChartContainer, ChartLegend, ChartLegendContent } from "@pleiades/ui/components/chart"
import type { ChartConfig } from "@pleiades/ui/components/chart"
import { Meter, MeterLabel, MeterValue } from "@pleiades/ui/components/meter"
import { Progress, ProgressLabel, ProgressValue } from "@pleiades/ui/components/progress"
import { cn } from "@pleiades/ui/lib/utils"
import type { ReactNode } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { Example, Examples, Section, Token, Topic } from "@/block.tsx"
import { bearingTemperature } from "@/series-data.ts"

// The rules of this repository that are easiest to break, each drawn right and drawn wrong.

const machines: ReadonlyArray<{ name: string; state: State }> = [
  { name: "P-04", state: "alarm" },
  { name: "P-07", state: "running" },
  { name: "M-02", state: "setup" },
]

/** A state as a band draws it, and as it must not: the colour alone. */
const band: Record<"right" | "wrong", Record<"running" | "alarm", string>> = {
  right: { running: "bg-state-running", alarm: "band-alarm" },
  wrong: { running: "bg-state-running", alarm: "bg-state-alarm" },
}

const dot: Record<State, string> = {
  alarm: "bg-state-alarm",
  running: "bg-state-running",
  setup: "bg-state-setup",
  stopped: "bg-state-stopped",
  "no-data": "bg-state-no-data",
}

function Band({ how }: { how: "right" | "wrong" }) {
  return (
    <div aria-hidden className="flex h-3 w-full overflow-hidden rounded-sm">
      <div className={cn("grow-[5]", band[how].running)} />
      <div className={cn("grow-[2]", band[how].alarm)} />
      <div className={cn("grow-[3]", band[how].running)} />
    </div>
  )
}

/** A bar with the role it has for a screen reader, which is all that tells a meter from a progress bar. */
function Said({ role, children }: { role: "meter" | "progressbar"; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {children}
      <code className="font-mono text-xs text-muted-foreground">role="{role}"</code>
    </div>
  )
}

const seriesColours = {
  p04: { label: "P-04", color: "var(--chart-1)" },
  p07: { label: "P-07", color: "var(--chart-2)" },
} satisfies ChartConfig

const stateColours = {
  p04: { label: "P-04", color: "var(--state-alarm)" },
  p07: { label: "P-07", color: "var(--state-running)" },
} satisfies ChartConfig

function Temperatures({ config }: { config: ChartConfig }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-40 w-full">
      <LineChart accessibilityLayer data={bearingTemperature} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="time"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={23}
          padding={{ left: 16, right: 16 }}
        />
        <YAxis hide domain={[30, 70]} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line dataKey="p04" type="monotone" stroke="var(--color-p04)" strokeWidth={2} dot={false} />
        <Line dataKey="p07" type="monotone" stroke="var(--color-p07)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  )
}

export function DoAndDont() {
  return (
    <Section id="do-and-dont" line="Three rules of this repository that are easy to break, each drawn right and drawn wrong.">
      <Topic
        title="A state is never a colour alone"
        line="A state carries a symbol and a word, and an alarm band is hatched. The red of an alarm and the green of running are equally light: to a person who cannot tell red from green, the two on the right are the same."
      >
        <Examples>
          <Example title="Do" className="flex-col items-stretch gap-4">
            <div className="flex flex-wrap gap-3">
              {machines.map((machine) => (
                <span key={machine.name} className="flex items-center gap-2 text-sm font-medium">
                  {machine.name}
                  <Badge variant="outline">
                    <StateSymbol state={machine.state} />
                    {stateLabel[machine.state]}
                  </Badge>
                </span>
              ))}
            </div>
            <Band how="right" />
          </Example>
          <Example title="Don't" dont className="flex-col items-stretch gap-4">
            <div className="flex flex-wrap gap-3">
              {machines.map((machine) => (
                <span key={machine.name} className="flex h-5 items-center gap-2 text-sm font-medium">
                  {machine.name}
                  <span className={cn("size-2.5 rounded-full", dot[machine.state])} />
                </span>
              ))}
            </div>
            <Band how="wrong" />
          </Example>
        </Examples>
      </Topic>

      <Topic
        title="Meter for a measurement, Progress for a task"
        line="The two look alike and say different things. A meter is a value in its range, and it may go up and down for ever. Progress is how far a task has come, and it ends. A screen reader announces which one it is."
      >
        <Examples>
          <Example title="Do" className="flex-col items-stretch gap-6">
            <Said role="meter">
              <Meter value={0.8} max={1} format={{ style: "percent" }}>
                <MeterLabel>Feed override</MeterLabel>
                <MeterValue />
              </Meter>
            </Said>
            <Said role="progressbar">
              <Progress value={62}>
                <ProgressLabel>Reading the history of P-04</ProgressLabel>
                <ProgressValue />
              </Progress>
            </Said>
          </Example>
          <Example title="Don't" dont className="flex-col items-stretch gap-6">
            <Said role="progressbar">
              <Progress value={80}>
                <ProgressLabel>Feed override</ProgressLabel>
                <ProgressValue />
              </Progress>
            </Said>
            <Said role="meter">
              <Meter value={62}>
                <MeterLabel>Reading the history of P-04</MeterLabel>
                <MeterValue />
              </Meter>
            </Said>
          </Example>
        </Examples>
      </Topic>

      <Topic
        title="Chart colours for series, state colours for states"
        line={
          <>
            A series takes its colour from <Token>--chart-*</Token>, a state from <Token>--state-*</Token>, never the
            other way round. On the right, P-04 reads as a machine in alarm and P-07 as one that runs: the chart says
            something it does not know.
          </>
        }
      >
        <Examples>
          <Example title="Do">
            <Temperatures config={seriesColours} />
          </Example>
          <Example title="Don't" dont>
            <Temperatures config={stateColours} />
          </Example>
        </Examples>
      </Topic>
    </Section>
  )
}
