import type { State } from "@pleiades/cards/machine/contract.ts"
import { clock } from "@pleiades/cards/machine/format.ts"
import { stateOf } from "@pleiades/cards/machine/state.ts"
import { Badge } from "@pleiades/cards/ui/badge.tsx"
import { Card } from "@pleiades/cards/ui/card.tsx"
import { Skeleton } from "@pleiades/cards/ui/skeleton.tsx"
import { createFileRoute } from "@tanstack/react-router"
import { FactoryIcon, HouseIcon } from "lucide-react"
import { Fragment } from "react"
import type { ReactNode } from "react"

import { useChatPanel } from "@/chat/ask.ts"
import { NoAnswer } from "@/components/no-answer.tsx"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ItemGroup, ItemSeparator } from "@/components/ui/item"
import { useLive } from "@/hooks/use-live.ts"
import { getMachines } from "@/machines/get-machines.ts"
import { MachineRow, MachineTile } from "@/machines/machine-item.tsx"

/** Home asks "what needs you?": first the machines that do, then the rest. */
const groups: ReadonlyArray<{ title: string; states: ReadonlyArray<State> }> = [
  { title: "Needs you", states: ["alarm", "stopped", "no-data"] },
  { title: "Setup", states: ["setup"] },
  { title: "Running", states: ["running"] },
]

export const Route = createFileRoute("/")({
  // The entry of this page in the sidebar. A page that names none stands in no list.
  staticData: { nav: { title: "Home", icon: HouseIcon, order: 0 } },
  // If the server of the app itself is away for a moment, the page says so and keeps trying.
  loader: () => getMachines().catch((error: unknown) => ({ values: null, error: String(error) })),
  component: Home,
  pendingComponent: Loading,
})

function Home() {
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
        // "Needs you" is the question of this page, so it also says when the answer is "nothing".
        if (members.length === 0 && title !== "Needs you") return null
        return (
          <section key={title} className="flex flex-col gap-2.5">
            <h2 className="flex items-center gap-2 font-medium">
              {title}
              <Badge variant="secondary">{members.length}</Badge>
            </h2>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No machine needs you right now.</p>
            ) : title === "Running" ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
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
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </Page>
  )
}
