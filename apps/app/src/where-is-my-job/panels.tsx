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

import { conceptStations, finished, utilisation, waiting, workingOn } from "./floor.ts"
import type { FloorPage, Job, Order, OrderState, Step } from "./floor.ts"

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
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing needs you</EmptyTitle>
            <EmptyDescription>No alarm, no silent machine and no order held up.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
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
      {machine.notifications.map((one) => (
        <Alert key={one.correlationId} variant={one.level === "Error" ? "destructive" : "default"}>
          <CircleAlertIcon />
          <AlertTitle>
            {one.level === "Error" ? "Alarm" : "Warning"} since {clock(one.raisedAt)}
          </AlertTitle>
          <AlertDescription>{one.title}</AlertDescription>
        </Alert>
      ))}
      <ItemGroup className="grid grid-cols-2 gap-3">
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
            <ItemTitle className="text-xl tabular-nums">{jobs?.orders ? queue.length : "–"}</ItemTitle>
            <ItemDescription className="text-xs">job orders waiting</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
      <MachineBand show={show} />
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
            {done.map(({ job, result }) => (
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
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>Waiting</h3>
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No job order is released.</p>
        ) : (
          <ItemGroup className="gap-1.5">
            {queue.map((job) => (
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
        <p className="text-xs text-muted-foreground">
          The machine knows no planned times: the data model has PlannedStartTime, the stack has no plan to fill it.
        </p>
      </section>
    </div>
  )
}

/** What the order is known by, and whether the stack has it. */
function knownAs(order: Order): Array<{ label: string; value: string | null }> {
  return [
    { label: "Order number", value: order.number },
    { label: "Job order", value: order.steps.map((one) => one.job.jobOrderId).join(", ") },
    { label: "Work master", value: order.at.job.workMaster },
    { label: "Sheet · position", value: null },
    { label: "Box", value: null },
  ]
}

/** A step of the path that publishes nothing yet. */
function ConceptStep({ icon: Icon, name, missing, last }: { icon: LucideIcon; name: string; missing: string; last: boolean }) {
  return (
    <li className="flex gap-3">
      <div className="flex w-4 shrink-0 flex-col items-center">
        <span aria-hidden className="mt-1 size-3.5 shrink-0 rounded-full border-2 border-dotted border-muted-foreground bg-background" />
        {!last && <span aria-hidden className="my-0.5 w-0 flex-1 border-l-2 border-dotted border-border" />}
      </div>
      <div className="flex flex-1 flex-col gap-1 pb-4">
        <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Icon className="size-4" />
          {name}
        </span>
        <Badge variant="outline" className="border-dashed">
          No source yet
        </Badge>
        <span className="text-xs text-muted-foreground">{missing}</span>
      </div>
    </li>
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
    <div className="flex flex-col gap-5">
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
      <Progress value={Math.round((reached / order.steps.length) * 100)}>
        <ProgressLabel className="text-xs font-normal text-muted-foreground">
          {reached} of {order.steps.length} machine steps done
        </ProgressLabel>
        <ProgressValue className="text-xs" />
      </Progress>
      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>Known as</h3>
        <p className="text-xs text-muted-foreground">Solid: the stack has it. Dashed: no source yet.</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {knownAs(order).map(({ label, value }, index) => (
            <Fragment key={label}>
              {index > 0 && <span aria-hidden className="text-muted-foreground">→</span>}
              <Badge
                variant={value ? "secondary" : "outline"}
                className={cn("h-auto flex-col items-start py-1", !value && "border-dashed")}
              >
                <span className="text-[0.625rem] font-normal text-muted-foreground">{label}</span>
                {value ?? "no source"}
              </Badge>
            </Fragment>
          ))}
        </div>
      </section>
      {/* The path as a vertical line of steps: no component draws one, so the dots and lines are our own. */}
      <ol className="flex flex-col">
        <ConceptStep icon={CodeXmlIcon} name={conceptStations.program.name} missing={conceptStations.program.missing} last={false} />
        {order.steps.map((step) => {
          const look = lookOf(step.job)
          return (
            <li key={`${step.machine}:${step.job.jobOrderId}`} className="flex gap-3">
              <div className="flex w-4 shrink-0 flex-col items-center">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 size-3.5 shrink-0 rounded-full",
                    look === "done" && "bg-primary",
                    look === "current" && "border-4 border-primary bg-background ring-3 ring-primary/20",
                    look === "blocked" && "border-4 border-destructive bg-background ring-3 ring-destructive/20",
                    look === "aborted" && "bg-destructive",
                    look === "planned" && "border-2 border-dashed border-muted-foreground bg-background",
                  )}
                />
                <span aria-hidden className={cn("my-0.5 w-0 flex-1 border-l-2", look === "done" ? "border-primary" : "border-dashed border-border")} />
              </div>
              <div className="flex flex-1 flex-col gap-1 pb-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    <FactoryIcon className="size-4" />
                    {step.job.jobName ?? "Job order"} {step.job.jobOrderId}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {step.result?.end
                      ? `${clock(step.result.start ?? step.result.end)} to ${clock(step.result.end)}`
                      : step.result?.start
                        ? `since ${clock(step.result.start)}`
                        : step.job.plannedStart
                          ? `about ${clock(step.job.plannedStart)}`
                          : "no plan"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={stepTag[look].variant} className={cn(look === "planned" && "border-dashed")}>
                    {stepTag[look].label}
                  </Badge>
                  <Button variant="link" size="xs" className="h-auto px-0" onClick={() => onMachine(step.machine)}>
                    {machineName(page, step.machine)}
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {quantity(step)} made{step.result?.good != null ? ` · ${step.result.good} good` : ""}
                </span>
              </div>
            </li>
          )
        })}
        <ConceptStep icon={PackageIcon} name={conceptStations.pack.name} missing={conceptStations.pack.missing} last />
      </ol>
      {order.steps.length === 1 && (
        <p className="text-xs text-muted-foreground">
          {order.number === null
            ? "The job order names no order number, so it is an order of its own."
            : `The order passes one machine: no other job order names ${order.number}.`}{" "}
          Once the ERP gives the job orders of several machines the same order number, its path runs across them by
          itself.
        </p>
      )}
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
  const words = query.trim().toLowerCase()
  // The names of the machines, once for all rows. Each tick gives new machines with the same names.
  const named = page.machines.map((one) => `${one.show.machine.machine}\t${titleOf(one.show.machine)}`).join("\n")
  const names = useMemo(() => new Map(named.split("\n").map((line) => line.split("\t") as [string, string])), [named])
  const nameOf = (id: string) => names.get(id) ?? id
  const rows = orders.filter((one) =>
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
      {rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No order found</EmptyTitle>
            <EmptyDescription>No order, job order or machine matches “{query}”.</EmptyDescription>
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
