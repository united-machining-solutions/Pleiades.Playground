import type { MachineList } from "@pleiades/cards/machine/contract.ts"
import { clock } from "@pleiades/cards/machine/format.ts"
import { stateOf } from "@pleiades/cards/machine/state.ts"
import { ShopfloorCard } from "@pleiades/cards/shopfloor/shopfloor-card.tsx"
import { Badge } from "@pleiades/ui/components/badge"
import { Card } from "@pleiades/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { ItemGroup, ItemSeparator } from "@pleiades/ui/components/item"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { ClipboardListIcon, FactoryIcon } from "lucide-react"
import { Fragment, useEffect } from "react"
import type { ReactNode } from "react"

import { useChatPanel } from "@/chat/ask.ts"
import { NoAnswer } from "@/components/no-answer.tsx"
import { useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { listAt, listWith, machineFilters } from "@/live/machines.ts"
import { getMachines, getShopfloor } from "@/machines/get-machines.ts"
import { MachineRow } from "@/machines/machine-item.tsx"

/**
 * The hall: what the assistant tells about the hall, black on white on one screen. Top to bottom
 * the shop floor card and the machines with their state, program, open warnings and errors, in the
 * order the backend returns them. The page asks and draws; it computes nothing.
 */
/** The machines are read once, from the backend; then every value comes from the broker. */
const live: Live<MachineList | null> = {
  filters: machineFilters(),
  message: (values, topic, payload, now) => values && listWith(values, topic, payload, now),
  at: (values, now) => values && listAt(values, now),
}

/** How often the plan of the hall is read again. */
const PLAN_MS = 10_000

export const Route = createFileRoute("/hall")({
  staticData: { nav: { title: "Hall", icon: ClipboardListIcon } },
  // Each answer on its own: if one is missing, the other still stands, and the page keeps trying.
  loader: async () => {
    const [shopfloor, machines] = await Promise.all([
      getShopfloor().catch((error: unknown) => ({ values: null, error: String(error) })),
      getMachines().catch((error: unknown) => ({ values: null, error: String(error) })),
    ])
    return { shopfloor, machines }
  },
  component: Hall,
  pendingComponent: Loading,
})

function Hall() {
  const { shopfloor, machines } = Route.useLoaderData()
  const { ask } = useChatPanel()
  // The machines stay live from the broker, as on Home. The plan of the hall is computed by the
  // backend, so it is read again every few seconds.
  const { values: list } = useLive(machines.values, live)
  useRetry(machines.values === null)
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => void router.invalidate(), PLAN_MS)
    return () => clearInterval(timer)
  }, [router])

  const asOf = list?.asOf ?? shopfloor.values?.asOf
  return (
    <Page line={asOf ? `live · Stand ${clock(asOf)}` : undefined}>
      <section className="flex flex-col gap-2.5">
        <h2 className="font-medium">Halle</h2>
        {shopfloor.values ? <ShopfloorCard {...shopfloor.values} /> : <NoAnswer error={shopfloor.error} />}
      </section>
      <section className="flex flex-col gap-2.5">
        <h2 className="flex items-center gap-2 font-medium">
          Maschinen
          {list && <Badge variant="secondary">{list.machines.length}</Badge>}
        </h2>
        {list === null ? (
          <NoAnswer error={machines.error ?? ""} />
        ) : list.machines.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FactoryIcon />
              </EmptyMedia>
              <EmptyTitle>Keine Maschinen</EmptyTitle>
              <EmptyDescription>Keine Maschine hat in den letzten 24 Stunden einen Wert gesendet.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Machines values={list} onAsk={ask} />
        )}
      </section>
    </Page>
  )
}

/** The machines in the order of the backend, with the same rows as Home and the chat. */
function Machines({ values: { asOf, machines }, onAsk }: { values: MachineList; onAsk: (question: string) => void }) {
  return (
    <Card className="gap-0 py-0">
      <ItemGroup className="gap-0">
        {machines.map((machine, index) => (
          <Fragment key={machine.machine}>
            {index > 0 && <ItemSeparator className="my-0" />}
            <MachineRow machine={machine} state={stateOf(machine, asOf)} asOf={asOf} onAsk={onAsk} />
          </Fragment>
        ))}
      </ItemGroup>
    </Card>
  )
}

function Page({ line, children }: { line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Hall</h1>
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
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </Page>
  )
}
