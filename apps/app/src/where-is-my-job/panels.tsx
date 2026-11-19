import type { MachineShow, State } from "@pleiades/cards/machine/contract.ts"
import { clock } from "@pleiades/cards/machine/format.ts"
import { titleOf } from "@pleiades/cards/machine/in-words.ts"
import { StateBand } from "@pleiades/cards/machine/state-band.tsx"
import type { Spans } from "@pleiades/cards/machine/state-band.tsx"
import { stateLabel, stateOf } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@pleiades/ui/components/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@pleiades/ui/components/item"
import { Meter, MeterLabel, MeterValue } from "@pleiades/ui/components/meter"
import { Progress, ProgressLabel, ProgressValue } from "@pleiades/ui/components/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { cn } from "cn"
import {
  CheckCheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CodeXmlIcon,
  FactoryIcon,
  PackageIcon,
  SearchIcon,
  SearchXIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Fragment, useEffect, useMemo, useState } from "react"

import { getSpans } from "@/machines/get-machines.ts"

import { conceptStations, finished, phaseOf, utilisation, waiting, workingOn } from "./floor.ts"
import type { FloorPage, Job, Order, OrderPhase, OrderState, Step } from "./floor.ts"

const heading = "text-xs font-medium tracking-wide text-muted-foreground uppercase"

const orderTag: Record<OrderState, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  running: { label: "In progress", variant: "default" },
  interrupted: { label: "Held up", variant: "destructive" },
  waiting: { label: "Waiting", variant: "outline" },
  ended: { label: "Done", variant: "secondary" },
  aborted: { label: "Aborted", variant: "destructive" },
}

/**
 * How far an order is with one step: through it, at it, held up at it (it may go on), aborted
 * there (it will not), or still to come. A state the page does not know is still to come.
 */
type StepLook = "done" | "current" | "blocked" | "aborted" | "planned"

function lookOf(job: Job): StepLook {
  if (job.state === "Ended") return "done"
  if (job.state === "Running") return "current"
  if (job.state === "Interrupted") return "blocked"
  if (job.state === "Aborted") return "aborted"
  return "planned"
}

const stepTag: Record<StepLook, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  done: { label: "Done", variant: "secondary" },
  current: { label: "In progress", variant: "default" },
  blocked: { label: "Held up", variant: "destructive" },
  aborted: { label: "Aborted", variant: "destructive" },
  planned: { label: "Waiting", variant: "outline" },
}

const machineName = (page: FloorPage, id: string) => {
  const entry = page.machines.find((one) => one.show.machine.machine === id)
  return entry ? titleOf(entry.show.machine) : id
}

/** A job order with what came of it: `3 of 12`. */
function quantity(step: Pick<Step, "job" | "result">) {
  return `${step.result?.produced ?? 0} of ${step.job.runsPlanned ?? "?"}`
}

/** Perspective 1: what needs a person on the shop floor now. */
export function FloorPanel({
  page,
  orders,
  onMachine,
  onOrder,
}: {
  page: FloorPage
  orders: ReadonlyArray<Order>
  onMachine: (id: string) => void
  onOrder: (key: string) => void
}) {
  const needs: Array<{ key: string; state: State | "warning"; title: string; detail: string; open: () => void }> = []
  for (const { show } of page.machines) {
    const { machine } = show
    const state = stateOf(machine, page.asOf)
    if (state === "alarm") {
      needs.push({
        key: machine.machine,
        state: "alarm",
        title: `${titleOf(machine)} in alarm`,
        detail: machine.notifications.find((one) => one.level === "Error")?.title ?? "An alert stands.",
        open: () => onMachine(machine.machine),
      })
    }
    if (state === "no-data") {
      needs.push({
        key: machine.machine,
        state: "no-data",
        title: `${titleOf(machine)} is silent`,
        detail: machine.lastValueAt ? `Last value at ${clock(machine.lastValueAt)}` : "No value yet",
        open: () => onMachine(machine.machine),
      })
    }
  }
  // A job order the planner took back before it ran is not among the orders: nobody waits for it.
  for (const order of orders.filter((one) => one.state === "interrupted" || one.state === "aborted")) {
    needs.push({
      key: order.key,
      state: order.state === "aborted" ? "alarm" : "warning",
      title: `Order ${order.label} ${order.state === "aborted" ? "aborted" : "held up"}`,
      detail: `${order.at.job.jobOrderId} at ${machineName(page, order.at.machine)} · ${quantity(order.at)}`,
      open: () => onOrder(order.key),
    })
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className={heading}>Needs you · now {clock(page.asOf)}</h3>
      {needs.length === 0 ? (
        <Empty className="gap-2 border border-dashed p-4 md:p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing needs you</EmptyTitle>
            <EmptyDescription>No alarm, no silent machine and no order held up.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {needs.map((one) => (
            <Item
              key={one.key}
              variant="outline"
              size="sm"
              render={<button type="button" onClick={one.open} />}
              className="cursor-pointer text-left hover:bg-muted/50"
            >
              <ItemMedia variant="icon" className="h-5">
                <StateSymbol state={one.state} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{one.title}</ItemTitle>
                <ItemDescription>{one.detail}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </section>
  )
}

/** Perspective 2: one machine, what it did, does and will do. */
export function MachinePanel({
  page,
  orders,
  machine: id,
  backTo,
  onBack,
  onOrder,
}: {
  page: FloorPage
  orders: ReadonlyArray<Order>
  machine: string
  backTo: Order | null
  onBack: () => void
  onOrder: (key: string) => void
}) {
  const entry = page.machines.find((one) => one.show.machine.machine === id)
  if (!entry) return null
  const { show } = entry
  const { machine } = show
  const state = stateOf(machine, page.asOf)
  const jobs = page.jobs[id]
  const queue = waiting(jobs)
  const done = finished(jobs)
  // The job order the tile names, so the two do not differ.
  const running = workingOn(jobs, machine.jobOrder?.jobOrderId ?? null)
  const runningResult = running && jobs?.results?.find((one) => one.jobOrderId === running.jobOrderId)
  const orderOf = (job: Job) =>
    orders.find((one) => one.steps.some((step) => step.machine === id && step.job.jobOrderId === job.jobOrderId)) ?? null
  const openOrderOf = (job: Job) => {
    const order = orderOf(job)
    if (order) onOrder(order.key)
  }
  const runningOrder = running ? orderOf(running) : null

  return (
    <div className="flex flex-col gap-5">
      {backTo && (
        <Button variant="outline" size="sm" className="self-start" onClick={onBack}>
          <ChevronRightIcon data-icon="inline-start" className="rotate-180" />
          Back to order {backTo.label}
        </Button>
      )}
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
      <Item variant="muted" size="sm">
        <ItemMedia variant="icon">
          <FactoryIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="text-base">
            {titleOf(machine)}
            <Badge variant="outline">
              <StateSymbol state={state} />
              {stateLabel[state]}
            </Badge>
          </ItemTitle>
          <ItemDescription>{machine.identity.manufacturer ?? machine.machine}</ItemDescription>
        </ItemContent>
      </Item>
      {/* Producing and waiting stand beside who the machine is. */}
      <MachineStats show={show} waitingCount={jobs?.orders ? queue.length : null} />
      </div>
      {machine.notifications.map((one) => (
        <Alert key={one.correlationId} variant={one.level === "Error" ? "destructive" : "default"}>
          <CircleAlertIcon />
          <AlertTitle>
            {one.level === "Error" ? "Alarm" : "Warning"} since {clock(one.raisedAt)}
          </AlertTitle>
          <AlertDescription>{one.title}</AlertDescription>
        </Alert>
      ))}
      <MachineBand show={show} />
      <div className="grid gap-5 md:grid-cols-3">
      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>Now {clock(page.asOf)}</h3>
        {running ? (
          <>
            <p className="font-medium">
              {running.jobName ?? "Job order"} · {running.jobOrderId}
              {running.state === "Interrupted" && (
                <Badge variant="destructive" className="ml-2">
                  Interrupted
                </Badge>
              )}
            </p>
            <Progress value={running.runsPlanned ? Math.round(((runningResult?.produced ?? 0) / running.runsPlanned) * 100) : null}>
              <ProgressLabel className="text-xs font-normal text-muted-foreground">
                {quantity({ job: running, result: runningResult ?? null })} made · work master {running.workMaster ?? "–"}
              </ProgressLabel>
              <ProgressValue className="text-xs" />
            </Progress>
            {runningOrder && (
              <Button variant="outline" size="sm" className="self-start rounded-full" onClick={() => onOrder(runningOrder.key)}>
                Order {runningOrder.label}
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {jobs?.orders ? "No job order runs." : machine.jobOrder ? `Job order ${machine.jobOrder.jobOrderId}` : "No job order heard yet."}
          </p>
        )}
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>Done</h3>
        {done.length === 0 ? (
          <p className="text-sm text-muted-foreground">No job order ended in the shift the machine keeps.</p>
        ) : (
          <ItemGroup className="gap-1.5">
            {done.slice(0, LISTED).map(({ job, result }) => (
              <Item
                key={job.jobOrderId}
                variant="outline"
                size="xs"
                render={<button type="button" onClick={() => openOrderOf(job)} />}
                className="cursor-pointer text-left hover:bg-muted/50"
              >
                <ItemContent className="flex-row gap-3">
                  <span className="w-12 shrink-0 text-muted-foreground tabular-nums">{result?.end ? clock(result.end) : "–"}</span>
                  {job.jobOrderId} · {result?.produced ?? 0} made{job.state === "Aborted" ? " · aborted" : ""}
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
        <More count={done.length} />
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>Waiting</h3>
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No job order is released.</p>
        ) : (
          <ItemGroup className="gap-1.5">
            {queue.slice(0, LISTED).map((job) => (
              <Item
                key={job.jobOrderId}
                variant="outline"
                size="xs"
                render={<button type="button" onClick={() => openOrderOf(job)} />}
                className="cursor-pointer border-dashed text-left hover:bg-muted/50"
              >
                <ItemContent className="flex-row gap-3">
                  <span className="w-12 shrink-0 text-muted-foreground tabular-nums">
                    {job.plannedStart ? clock(job.plannedStart) : "no plan"}
                  </span>
                  {job.jobOrderId} · {job.jobName ?? ""} · {job.runsPlanned ?? "?"} pieces
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
        <More count={queue.length} />
      </section>
      </div>
    </div>
  )
}

/** How many job orders a list of the machine panel shows; it says how many more there are. */
const LISTED = 5

/** The line under a list that shows only the first LISTED of `count`. */
function More({ count }: { count: number }) {
  return count > LISTED ? <p className="text-xs text-muted-foreground">and {count - LISTED} more</p> : null
}

/** What the order is known by, and whether the stack has it: the sheet and the box have no source yet. */
function knownAs(order: Order): Array<{ label: string; value: string | null }> {
  return [
    { label: "Order number", value: order.number },
    { label: "Job order", value: order.steps.map((one) => one.job.jobOrderId).join(", ") },
    { label: "Work master", value: order.at.job.workMaster },
    { label: "Sheet · position", value: null },
    { label: "Box", value: null },
  ]
}

/** How much of its history the machine was producing, and how many job orders wait for it. */
function MachineStats({ show, waitingCount }: { show: MachineShow; waitingCount: number | null }) {
  return (
    <>
      <Item variant="outline" size="sm">
        <ItemContent>
          <Meter value={Math.round((utilisation(show) ?? 0) * 100)} className="gap-1.5">
            <MeterLabel className="text-xs font-normal text-muted-foreground">Producing</MeterLabel>
            <MeterValue className="text-xs" />
          </Meter>
        </ItemContent>
      </Item>
      <Item variant="outline" size="sm">
        <ItemContent>
          <ItemTitle className="text-xl tabular-nums">{waitingCount ?? "–"}</ItemTitle>
          <ItemDescription className="text-xs">job orders waiting</ItemDescription>
        </ItemContent>
      </Item>
    </>
  )
}

/** Perspective 3: one order on its way across the shop floor. */
export function OrderPanel({
  page,
  order,
  onMachine,
}: {
  page: FloorPage
  order: Order
  onMachine: (id: string) => void
}) {
  const reached = order.steps.filter((one) => one.job.state === "Ended").length
  const here = machineName(page, order.at.machine)

  return (
    <div className="grid items-start gap-4 md:grid-cols-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-semibold">{order.label}</span>
        <span className="text-sm text-muted-foreground">
          {order.jobName ?? "Job order"} · {order.steps.length} {order.steps.length === 1 ? "machine" : "machines"}
        </span>
      </div>
      <Alert variant={order.state === "interrupted" || order.state === "aborted" ? "destructive" : "default"}>
        {(order.state === "interrupted" || order.state === "aborted") && <CircleAlertIcon />}
        <AlertTitle>
          {order.state === "running" && `In progress at ${here}`}
          {order.state === "interrupted" && `Held up at ${here}`}
          {order.state === "waiting" && `Waits for its start at ${here}`}
          {order.state === "ended" && `Done at ${here}, on to packing`}
          {order.state === "aborted" && `Aborted at ${here}`}
        </AlertTitle>
        <AlertDescription>
          {order.at.job.jobOrderId} · {quantity(order.at)} made
          {order.at.result?.start ? ` · started ${clock(order.at.result.start)}` : ""}
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-2">
      <Progress value={Math.round((reached / order.steps.length) * 100)}>
        <ProgressLabel className="text-xs font-normal text-muted-foreground">
          {reached} of {order.steps.length} machine steps done
        </ProgressLabel>
        <ProgressValue className="text-xs" />
      </Progress>
      {/* The path in one line: the map draws it, this names its machines and opens one. */}
      {order.steps.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {order.steps.map((step, index) => (
            <Fragment key={`${step.machine}:${step.job.jobOrderId}`}>
              {index > 0 && <span aria-hidden className="text-muted-foreground">→</span>}
              <Button variant="link" size="xs" className="h-auto px-0" onClick={() => onMachine(step.machine)}>
                {machineName(page, step.machine)}
              </Button>
            </Fragment>
          ))}
        </div>
      )}
      </div>
      {/* What the order is known by: the gaps of the page, the sheet and the box, stand dashed. */}
      <section className="flex flex-col gap-1.5 md:col-span-3">
        <h3 className={heading}>Known as</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {knownAs(order).map(({ label, value }) => (
            <Badge
              key={label}
              variant={value ? "secondary" : "outline"}
              className={cn("h-auto flex-col items-start py-1", !value && "border-dashed")}
            >
              <span className="text-[0.625rem] font-normal text-muted-foreground">{label}</span>
              {value ?? "no source yet"}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  )
}

/** Every order in one list, held-up ones first, with its path as a row of signs. */
export function OrdersTable({
  page,
  orders,
  chosen,
  onOrder,
}: {
  page: FloorPage
  orders: ReadonlyArray<Order>
  chosen: string | null
  onOrder: (key: string) => void
}) {
  const [query, setQuery] = useState("")
  // On its way by default: the orders that move across the floor are the ones to follow.
  const [phase, setPhase] = useState<OrderPhase | "all">("moving")
  const words = query.trim().toLowerCase()
  // The names of the machines, once for all rows. Each tick gives new machines with the same names.
  const named = page.machines.map((one) => `${one.show.machine.machine}\t${titleOf(one.show.machine)}`).join("\n")
  const names = useMemo(() => new Map(named.split("\n").map((line) => line.split("\t") as [string, string])), [named])
  const nameOf = (id: string) => names.get(id) ?? id
  const count = (wanted: OrderPhase) => orders.filter((one) => phaseOf(one) === wanted).length
  const rows = orders.filter((one) =>
    (phase === "all" || phaseOf(one) === phase) &&
    `${one.label} ${one.jobName ?? ""} ${one.steps.map((step) => `${step.job.jobOrderId} ${nameOf(step.machine)}`).join(" ")}`
      .toLowerCase()
      .includes(words),
  )

  if (orders.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>No job orders</EmptyTitle>
          <EmptyDescription>
            No machine has a job order on its list in the last 24 hours. A new one appears here as its machine
            publishes it.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[phase]}
        onValueChange={(value) => value[0] && setPhase(value[0] as OrderPhase | "all")}
        aria-label="Show orders"
      >
        <ToggleGroupItem value="moving">In circulation · {count("moving")}</ToggleGroupItem>
        <ToggleGroupItem value="waiting">Not started · {count("waiting")}</ToggleGroupItem>
        <ToggleGroupItem value="through">Through · {count("through")}</ToggleGroupItem>
        <ToggleGroupItem value="all">All · {orders.length}</ToggleGroupItem>
      </ToggleGroup>
      <InputGroup className="max-w-sm">
        <InputGroupInput
          type="search"
          placeholder="Find an order, a job order or a machine"
          aria-label="Find an order, a job order or a machine"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>
      </div>
      {rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No order found</EmptyTitle>
            <EmptyDescription>
              {words ? `No order, job order or machine matches “${query}”.` : "No order is in this state right now."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Now</TableHead>
              <TableHead className="text-right">Made</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((order) => (
              <TableRow
                key={order.key}
                data-state={chosen === order.key ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => onOrder(order.key)}
              >
                <TableCell>
                  <Button
                    variant="link"
                    size="xs"
                    className="h-auto px-0 font-semibold"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOrder(order.key)
                    }}
                  >
                    {order.label}
                  </Button>
                  <div className="text-xs text-muted-foreground">{order.jobName ?? ""}</div>
                </TableCell>
                <TableCell>
                  {/* The path as a row of signs: no component draws one, so these are our own. */}
                  <span className="flex items-center">
                    <PathSign icon={CodeXmlIcon} look="concept" title={conceptStations.program.name} />
                    {order.steps.map((step) => {
                      const look = lookOf(step.job)
                      return (
                        <Fragment key={`${step.machine}:${step.job.jobOrderId}`}>
                          <span aria-hidden className={cn("w-2 border-t-2", look === "planned" ? "border-dashed border-border" : "border-primary")} />
                          <PathSign icon={FactoryIcon} look={look} title={`${nameOf(step.machine)} · ${step.job.jobOrderId} · ${stepTag[look].label}`} />
                        </Fragment>
                      )
                    })}
                    <span aria-hidden className="w-2 border-t-2 border-dotted border-border" />
                    <PathSign icon={PackageIcon} look="concept" title={conceptStations.pack.name} />
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Badge variant={orderTag[order.state].variant}>{orderTag[order.state].label}</Badge>
                    {nameOf(order.at.machine)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{quantity(order.at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function PathSign({ icon: Icon, look, title }: { icon: LucideIcon; look: StepLook | "concept"; title: string }) {
  return (
    <span
      title={title}
      className={cn(
        "flex size-6 items-center justify-center rounded-full",
        look === "done" && "bg-primary text-primary-foreground",
        look === "current" && "border-2 border-primary text-primary",
        look === "blocked" && "border-2 border-destructive text-destructive",
        look === "aborted" && "bg-destructive text-background",
        look === "planned" && "border border-dashed border-muted-foreground text-muted-foreground",
        look === "concept" && "border border-dotted border-muted-foreground text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" />
    </span>
  )
}

/**
 * The band of the machine that is open, read when it opens: the page reads no band for the
 * machines it does not show. It stays with the hours it was read for.
 */
function MachineBand({ show }: { show: MachineShow }) {
  const [history] = useState(show.history)
  const [spans, setSpans] = useState<Spans>()
  const { machine } = show.machine
  useEffect(() => {
    let wanted = true
    getSpans({ data: { machine, from: history.from, to: history.to } }).then(
      (read) => wanted && setSpans(read),
      () => wanted && setSpans(null),
    )
    return () => {
      wanted = false
    }
  }, [machine, history])
  return <StateBand history={history} spans={spans} />
}
