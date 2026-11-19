import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pleiades/ui/components/tabs"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { titleOf } from "@pleiades/cards/machine/in-words.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import type { State } from "@pleiades/cards/machine/contract.ts"
import { createFileRoute } from "@tanstack/react-router"
import { FactoryIcon, MessageSquareWarningIcon, PackageSearchIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { liveness, useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { getFloor } from "@/where-is-my-job/get-floor.ts"
import { floorAt, floorFilters, floorOf, floorWith, ordersOf } from "@/where-is-my-job/floor.ts"
import type { FloorPage, Order } from "@/where-is-my-job/floor.ts"
import { FloorMap } from "@/where-is-my-job/floor-map.tsx"
import type { Lens } from "@/where-is-my-job/floor-map.tsx"
import { FloorPanel, MachinePanel, OrderPanel, OrdersTable } from "@/where-is-my-job/panels.tsx"

/** Read once from the backend, the job orders among them; then every value comes from the broker. */
const live: Live<FloorPage | null> = {
  filters: floorFilters,
  message: (page, topic, payload, now) => page && floorWith(page, topic, payload, now),
  at: (page, now) => page && floorAt(page, now),
}

/**
 * Where is My Job? A basis for discussion: how an order could be followed across the shop floor.
 * It shows the machines of the stack with their real state, job orders and history, and an order as
 * every job order that names the same order number. What the stack has no source for yet, the
 * programming before the machines, the packing after them, and a part by its sheet and position,
 * stands on the page as such. The chat does not know the page.
 *
 * It is a page of the app, with its entry in the sidebar: it reads only values the stack has.
 */
export const Route = createFileRoute("/where-is-my-job")({
  staticData: { nav: { title: "Where is My Job?", icon: PackageSearchIcon } },
  loader: () => getFloor().catch((error: unknown) => ({ values: null, error: String(error) })),
  component: WhereIsMyJob,
})

type View = "floor" | "machine" | "order"

const legendStates: ReadonlyArray<State> = ["running", "setup", "stopped", "alarm", "no-data"]

/** Whether an order passes a machine. */
const passes = (order: Order | null, machine: string) => order !== null && order.steps.some((step) => step.machine === machine)

function WhereIsMyJob() {
  const answer = Route.useLoaderData()
  // One object per read, so the page is not reset on every render.
  const loaded = useMemo(() => (answer.values ? floorOf(answer.values, answer.values.jobOrders) : null), [answer.values])
  const { values: page, connected } = useLive<FloorPage | null>(loaded, live)
  useRetry(answer.values === null)

  const [lens, setLens] = useState<Lens>("load")
  const [machine, setMachine] = useState<string | null>(null)
  // The chosen order, by its key (`Order.key`).
  const [orderKey, setOrderKey] = useState<string | null>(null)
  // The order a person came from when they opened a machine on its path.
  const [backTo, setBackTo] = useState<string | null>(null)

  // The page renders on every message and every second; the orders change only with the job orders
  // and the machines, of which only the ids count.
  const jobs = page?.jobs
  const ids = page?.machines.map((one) => one.show.machine.machine).join("\n") ?? ""
  const orders = useMemo(() => (jobs ? ordersOf(ids.split("\n"), jobs) : []), [jobs, ids])

  if (answer.values === null || page === null) {
    return (
      <Page>
        <NoAnswer error={answer.error ?? ""} />
      </Page>
    )
  }
  if (page.machines.length === 0) {
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

  const order = orders.find((one) => one.key === orderKey) ?? null
  const backOrder = orders.find((one) => one.key === backTo) ?? null
  const shown = page.machines.find((one) => one.show.machine.machine === machine) ?? null
  const view: View = order ? "order" : shown ? "machine" : "floor"

  // The way back to an order stays only for a machine on its path.
  const openMachine = (id: string, from: Order | null = null) => {
    setMachine(id)
    setOrderKey(null)
    setBackTo(passes(from, id) ? from!.key : null)
  }
  // An order keeps the open machine only when it was opened from that machine, so tab 2 always
  // names a machine that belongs to the order.
  const openOrder = (key: string, fromMachine = false) => {
    if (!fromMachine) setMachine(null)
    setOrderKey(key)
    setBackTo(null)
  }
  const openFloor = () => {
    setMachine(null)
    setOrderKey(null)
    setBackTo(null)
  }

  return (
    <Page line={`${page.machines.length} ${page.machines.length === 1 ? "machine" : "machines"} · ${liveness(connected, page.asOf)}`}>
      <Alert>
        <MessageSquareWarningIcon />
        <AlertTitle>For discussion</AlertTitle>
        <AlertDescription>
          How could an order be followed across the shop floor? The machines, their job orders and their hours are
          the real values of the stack. An order is every job order that names the same order number. Programming,
          packing and the single part on its sheet have no source yet: they stand here dashed, as the gaps to discuss.
        </AlertDescription>
      </Alert>

      <Tabs
        value={view}
        onValueChange={(value) => {
          if (value === "floor") openFloor()
          // From an order to its machine: the way back to the order stays.
          if (value === "machine") {
            setBackTo(shown && passes(order, shown.show.machine.machine) ? order!.key : null)
            setOrderKey(null)
          }
        }}
        className="gap-6"
      >
        <TabsList aria-label="Perspective">
          <TabsTrigger value="floor">1 · Shop floor</TabsTrigger>
          <TabsTrigger value="machine" disabled={!shown}>
            2 · {shown ? titleOf(shown.show.machine) : "Machine"}
          </TabsTrigger>
          <TabsTrigger value="order" disabled={!order}>
            3 · {order ? order.label : "Order"}
          </TabsTrigger>
        </TabsList>

        {/* Side by side where there is room; the perspective drops below the map where there is not. */}
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_780px] flex-col gap-6">
            <Card size="sm" className="min-w-0">
              <CardHeader>
                <CardTitle>The shop floor from above</CardTitle>
                <CardDescription>A tile opens its machine, a marker below it opens the order.</CardDescription>
                <CardAction>
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    spacing={0}
                    value={[lens]}
                    onValueChange={(value) => value[0] && setLens(value[0] as Lens)}
                    aria-label="Tiles show"
                  >
                    <ToggleGroupItem value="load">Utilisation</ToggleGroupItem>
                    <ToggleGroupItem value="queue">Queue</ToggleGroupItem>
                  </ToggleGroup>
                </CardAction>
              </CardHeader>
              <CardContent>
                <FloorMap
                  page={page}
                  orders={orders}
                  lens={lens}
                  machine={machine}
                  order={order}
                  onMachine={(id) => openMachine(id, order)}
                  onOrder={(key) => openOrder(key)}
                />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 text-xs text-muted-foreground">
                  {legendStates.map((state) => (
                    <span key={state} className="flex items-center gap-1.5">
                      <StateSymbol state={state} />
                      {stateLabel[state]}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="w-5 border-t-4 border-primary" />
                    path done
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="w-5 border-t-4 border-dashed border-primary" />
                    path to come
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="w-5 border-t-4 border-dotted border-muted-foreground" />
                    no source yet
                  </span>
                  <span>Utilisation: the share of its history a machine was producing.</span>
                </div>
              </CardContent>
            </Card>

            <Card size="sm" className="min-w-0">
              <CardHeader>
                <CardTitle>Orders on the shop floor</CardTitle>
                <CardDescription>{orders.length} orders from the job orders of the machines · held up ones first</CardDescription>
              </CardHeader>
              <CardContent>
                <OrdersTable page={page} orders={orders} chosen={orderKey} onOrder={(key) => openOrder(key)} />
              </CardContent>
            </Card>
          </div>

          {/* One Card in each tab, so both keep their own composition. */}
          <TabsContent value="floor" className="min-w-0 flex-[1_1_300px]">
            <Card size="sm">
              <CardHeader>
                <CardTitle>1 · Shop floor</CardTitle>
                <CardDescription>What needs someone now.</CardDescription>
              </CardHeader>
              <CardContent>
                <FloorPanel page={page} orders={orders} onMachine={(id) => openMachine(id)} onOrder={(key) => openOrder(key)} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="machine" className="min-w-0 flex-[1_1_300px]">
            <Card size="sm">
              <CardHeader>
                <CardTitle>2 · Machine</CardTitle>
                <CardDescription>What it did, what it does, what waits for it.</CardDescription>
              </CardHeader>
              <CardContent>
                {shown && (
                  <MachinePanel
                    // A machine of its own reads its band of its own.
                    key={shown.show.machine.machine}
                    page={page}
                    orders={orders}
                    machine={shown.show.machine.machine}
                    backTo={backOrder}
                    onBack={() => backOrder && openOrder(backOrder.key, true)}
                    onOrder={(key) => openOrder(key, true)}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="order" className="min-w-0 flex-[1_1_300px]">
            <Card size="sm">
              <CardHeader>
                <CardTitle>3 · Order</CardTitle>
                <CardDescription>Where it has been, where it is, where it goes.</CardDescription>
              </CardHeader>
              <CardContent>
                {order && <OrderPanel page={page} order={order} onMachine={(id) => openMachine(id, order)} />}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </Page>
  )
}

/** Wider than the other pages: the map and the perspective it opens stand side by side. */
function Page({ line, children }: { line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Where is My Job?</h1>
        {line && <p className="text-sm text-muted-foreground">{line}</p>}
      </div>
      {children}
    </div>
  )
}
