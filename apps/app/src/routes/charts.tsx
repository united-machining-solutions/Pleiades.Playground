import type { State } from "@pleiades/cards/machine/contract.ts"
import { clock } from "@pleiades/cards/machine/format.ts"
import { stateOf } from "@pleiades/cards/machine/state.ts"
import { Badge } from "@pleiades/ui/components/badge"
import { Card } from "@pleiades/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { ItemGroup, ItemSeparator } from "@pleiades/ui/components/item"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { createFileRoute } from "@tanstack/react-router"
import { ChartColumnIcon, FactoryIcon } from "lucide-react"
import { Fragment } from "react"
import type { ReactNode } from "react"

import { useChatPanel } from "@/chat/ask.ts"
import { NoAnswer } from "@/components/no-answer.tsx"
import { useLive } from "@/hooks/use-live.ts"
import { getMachine, getMachines, getSpans } from "@/machines/get-machines.ts"
import { MachineRow, MachineTile } from "@/machines/machine-item.tsx"
import { StateHistoryTile, StateTotalsTile } from "@/charts/state-tiles.tsx"
/**
 * Charts: the machines of Home, and below them tiles with charts of the last hours.
 */
const groups: ReadonlyArray<{ title: string; states: ReadonlyArray<State> }> = [
  { title: "Needs you", states: ["alarm", "stopped", "no-data"] },
  { title: "Setup", states: ["setup"] },
  { title: "Running", states: ["running"] },
]

export const Route = createFileRoute("/charts")({
  staticData: { nav: { title: "Charts", icon: ChartColumnIcon } },
  loader: async () => {
    const answer = await getMachines().catch((error: unknown) => ({ values: null, error: String(error) }))
    if (answer.values === null) return { ...answer, charts: [] }
    // For the tiles: the sums of each machine's last hours, and its states over the same hours.
    const charts = await Promise.all(
      answer.values.machines.map(async ({ machine }) => {
        const show = await getMachine({ data: machine }).catch(() => null)
        if (!show?.values) return null
        const { from, to } = show.values.history
        const spans = await getSpans({ data: { machine, from, to } }).catch(() => null)
        return { show: show.values, spans }
      }),
    )
    return { ...answer, charts: charts.filter((chart) => chart !== null) }
  },
  component: Charts,
  pendingComponent: Loading,
})

function Charts() {
  const answer = Route.useLoaderData()
  const { ask } = useChatPanel()
  useLive()

  if (answer.values === null) {
    return (
      <Page>
        <NoAnswer error={answer.error} />
      </Page>
    )
  }

  const { asOf, machines } = answer.values
  if (machines.length === 0) {
    return (
      <Page>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FactoryIcon />
            </EmptyMedia>
            <EmptyTitle>No machines</EmptyTitle>
            <EmptyDescription>No machine has published a value in the last 24 hours.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Page>
    )
  }

  const shown = machines.map((machine) => ({ machine, state: stateOf(machine, asOf) }))
  return (
    <Page line={`${machines.length} ${machines.length === 1 ? "machine" : "machines"} · live · now ${clock(asOf)}`}>
      {groups.map(({ title, states }) => {
        const members = states.flatMap((state) => shown.filter((one) => one.state === state))
        if (members.length === 0 && title !== "Needs you") return null
        return (
          <section key={title} className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2">
              {title}
              <Badge variant="secondary">{members.length}</Badge>
            </h2>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No machine needs you right now.</p>
            ) : title === "Running" ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
                {members.map(({ machine }) => (
                  <MachineTile key={machine.machine} machine={machine} asOf={asOf} />
                ))}
              </ul>
            ) : (
              <Card className="gap-0 py-0">
                <ItemGroup className="gap-0">
                  {members.map(({ machine, state }, index) => (
                    <Fragment key={machine.machine}>
                      {index > 0 && <ItemSeparator className="my-0" />}
                      <MachineRow machine={machine} state={state} asOf={asOf} onAsk={ask} />
                    </Fragment>
                  ))}
                </ItemGroup>
              </Card>
            )}
          </section>
        )
      })}
      {answer.charts.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2>Last hours</h2>
          <StateTotalsTile shows={answer.charts.map((chart) => chart.show)} />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
            {answer.charts.map(({ show, spans }) => (
              <StateHistoryTile
                key={show.machine.machine}
                machine={show.machine.machine}
                from={show.history.from}
                to={show.history.to}
                spans={spans}
              />
            ))}
          </div>
        </section>
      )}
    </Page>
  )
}

function Page({ line, children }: { line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Machines</h1>
        {line && <p className="text-sm text-muted-foreground">{line}</p>}
      </div>
      {children}
    </div>
  )
}

function Loading() {
  return (
    <Page>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </Page>
  )
}
