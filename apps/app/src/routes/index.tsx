import { createFileRoute, useRouter } from "@tanstack/react-router"
import { Fragment, useEffect } from "react"
import type { ReactNode } from "react"

import { useChatPanel } from "@/chat/ask.ts"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ItemGroup, ItemSeparator } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { clock } from "@/machines/format.ts"
import { getMachines } from "@/machines/get-machines.ts"
import { MachineRow, MachineTile } from "@/machines/machine-item.tsx"
import { groups, stateOf } from "@/machines/state.ts"

const REFRESH_EVERY_MS = 10_000

export const Route = createFileRoute("/")({
  // If the server of the app itself is away for a moment, the page says so and keeps trying.
  loader: () => getMachines().catch((error: unknown) => ({ list: null, error: String(error) })),
  component: Home,
  pendingComponent: Loading,
})

function Home() {
  const answer = Route.useLoaderData()
  const router = useRouter()
  const { ask } = useChatPanel()
  useEffect(() => {
    const timer = setInterval(() => void router.invalidate(), REFRESH_EVERY_MS)
    return () => clearInterval(timer)
  }, [router])

  if (answer.list === null) {
    return (
      <Page>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No answer from the backend</EmptyTitle>
            <EmptyDescription>
              The generative UI backend did not answer ({answer.error}). This page keeps trying.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Page>
    )
  }

  const { asOf, machines } = answer.list
  if (machines.length === 0) {
    return (
      <Page>
        <Empty>
          <EmptyHeader>
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
              <div role="list" className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
                {members.map(({ machine }) => (
                  <MachineTile key={machine.machine} machine={machine} asOf={asOf} />
                ))}
              </div>
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
