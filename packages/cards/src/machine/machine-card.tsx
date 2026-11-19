import { Fragment } from "react"
import type { ReactNode } from "react"

import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import type { MachineShow } from "./contract.ts"
import { clock, duration } from "./format.ts"
import { jobOrderInWords, titleOf } from "./in-words.ts"
import { openWarning, stateLabel, stateOf } from "./state.ts"
import { StateBand } from "./state-band.tsx"
import type { Spans } from "./state-band.tsx"
import { StateSymbol } from "./state-symbol.tsx"
import { tell } from "./tell.ts"

/**
 * The machine card: what one machine does now, since when, with which work master, and what it did
 * over the last hours. It draws the result of `genui_machine_show` and computes nothing but the
 * wording.
 *
 * The spans of its band are not part of that result. Whoever draws the card asks for them
 * (`genui_span_list`) and hands them in as they arrive. The card stands without them.
 *
 * `topics` false leaves out the line at the foot that names the topics read, for a page that names
 * none; the chat keeps it. `reported` false leaves out the line under the state that only says what
 * the control reports, such as "NotExecuting, as the control reports", for a page that wants the state
 * alone; the chat keeps it.
 */
export function MachineCard({ machine, asOf, history, spans, topics: withTopics = true, reported = true }: MachineShow & { spans?: Spans; topics?: boolean; reported?: boolean }) {
  const state = stateOf(machine, asOf)
  const told = tell(machine, state)
  const warning = openWarning(machine)
  const topics = [machine.itemState, machine.operationMode, machine.connection, machine.heartbeat, machine.program]
    .map((reading) => reading.topic)
    .concat(machine.notifications.slice(0, 1).map((one) => one.topic))

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">
          {titleOf(machine)}
        </CardTitle>
        <CardDescription>{machine.identity.manufacturer ?? machine.machine}</CardDescription>
        <CardAction>
          <Badge variant="outline">
            <StateSymbol state={state} />
            {stateLabel[state]}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
          {/* A running machine has nothing the matter: its work master follows below. */}
          {state !== "running" && (
            <Row label={stateLabel[state]}>
              {told.message}
              {told.detail && (reported || !told.reported) && <span className="block text-muted-foreground">{told.detail}</span>}
            </Row>
          )}
          {state === "running" && warning && <Row label="Warning">{warning.title}</Row>}
          {told.since && (
            <Row label="Since">
              <span className="tabular-nums">
                {told.atLeast ? "before " : ""}
                {clock(told.since)} · {told.atLeast ? "at least " : ""}
                {duration(told.since, asOf)}
              </span>
            </Row>
          )}
          {/* Without data the work master would be the last known one, not the present. */}
          {state !== "no-data" && machine.program.value && <Row label="Work master">{machine.program.value}</Row>}
          {state !== "no-data" && machine.jobOrder && <Row label="Job order">{jobOrderInWords(machine.jobOrder)}</Row>}
        </dl>
        <StateBand history={history} spans={spans} />
      </CardContent>
      {withTopics && (
        <CardFooter className="block text-xs break-words text-muted-foreground">
          Read at {clock(asOf)} from {topics.join(", ")}
        </CardFooter>
      )}
    </Card>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

/**
 * The machine card while it is read: its frame, its head and its badge, grey lines where a running
 * machine has its rows, and the band, so the card keeps its place when its values come.
 */
export function MachineCardSkeleton() {
  return (
    <Card size="sm" aria-hidden>
      <CardHeader>
        <CardTitle className="flex h-6 items-center">
          <Skeleton className="h-4 w-36" />
        </CardTitle>
        <CardDescription className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-28" />
        </CardDescription>
        <CardAction>
          <Skeleton className="h-5 w-20 rounded-full" />
        </CardAction>
      </CardHeader>
      <CardContent className="gap-4">
        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
          {["w-48", "w-28", "w-36", "w-32"].map((width, row) => (
            <Fragment key={row}>
              <div className="flex h-5 items-center">
                <Skeleton className="h-3.5 w-20" />
              </div>
              <div className="flex h-5 items-center">
                <Skeleton className={`h-3.5 ${width}`} />
              </div>
            </Fragment>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex h-4 items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-3 rounded-sm" />
          <div className="flex h-4 items-center justify-between">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
          </div>
          {/* The totals of the states, as many as a band mostly has: they wrap where the card is narrow. */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {["w-24", "w-24", "w-28", "w-24", "w-32"].map((width, position) => (
              <div key={position} className="flex h-4 items-center">
                <Skeleton className={`h-3 ${width}`} />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
