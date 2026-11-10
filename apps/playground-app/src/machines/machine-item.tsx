import type { Machine } from "@pleiades/genui-mcp"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"

import { clock, duration } from "./format.ts"
import { openError, openWarning, stateLabel } from "./state.ts"
import type { State } from "./state.ts"
import { StateSymbol } from "./state-symbol.tsx"

type Told = {
  /** What is the matter, and the quieter line below it. */
  message: string
  detail: string
  since: string | null
  /** The state began before the values that were read: "since" is only the earliest time known. */
  atLeast: boolean
}

function tell(machine: Machine, state: State): Told {
  const { itemState, operationMode, program } = machine
  const warning = openWarning(machine)
  switch (state) {
    case "alarm": {
      const error = openError(machine)
      return {
        message: error?.title ?? "Error",
        detail: `Error ${error?.notificationId ?? ""}`.trim(),
        since: error?.raisedAt ?? null,
        atLeast: false,
      }
    }
    case "stopped":
      return {
        message: warning?.title ?? "No alarm, no reason recorded",
        detail: warning ? `Warning ${warning.notificationId}` : `${itemState.value ?? "No state"}, as the control reports`,
        since: itemState.since,
        atLeast: itemState.sinceIsLowerBound,
      }
    case "no-data":
      return {
        message: "No data from the adapter",
        detail:
          itemState.value && itemState.at
            ? `Last known: ${itemState.value} at ${clock(itemState.at)}`
            : "Nothing known about this machine",
        since: machine.lastValueAt,
        atLeast: false,
      }
    case "setup":
      return {
        message: "Setup mode",
        detail: "Operation mode, as the control reports",
        since: operationMode.since,
        atLeast: operationMode.sinceIsLowerBound,
      }
    case "running":
      return {
        message: program.value ?? "No program",
        detail: warning ? `Warning: ${warning.title}` : "",
        since: itemState.since,
        atLeast: itemState.sinceIsLowerBound,
      }
  }
}

function Since({ told, asOf }: { told: Told; asOf: string }) {
  if (told.since === null) return null
  return (
    <ItemContent className="text-right">
      <ItemTitle className="ml-auto tabular-nums">
        {told.atLeast ? "since before" : "since"} {clock(told.since)}
      </ItemTitle>
      <ItemDescription className="text-right tabular-nums">
        {told.atLeast ? "at least " : ""}
        {duration(told.since, asOf)}
      </ItemDescription>
    </ItemContent>
  )
}

const why: Partial<Record<State, (machine: string) => string>> = {
  alarm: (machine) => `Why is ${machine} in alarm?`,
  stopped: (machine) => `Why is ${machine} stopped?`,
  "no-data": (machine) => `Why does ${machine} send no data?`,
}

/**
 * A machine that needs someone, or is in setup: one row of a list. With `onAsk`, a machine that
 * needs someone offers the question why.
 */
export function MachineRow({
  machine,
  state,
  asOf,
  onAsk,
}: {
  machine: Machine
  state: State
  asOf: string
  onAsk?: (question: string) => void
}) {
  const told = tell(machine, state)
  const question = why[state]?.(machine.machine)
  return (
    <Item role="listitem">
      {/* As tall as the first line, so the sign sits on it. */}
      <ItemMedia variant="icon" className="h-5">
        <StateSymbol state={state} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {machine.machine}
          <Badge variant="outline">{stateLabel[state]}</Badge>
        </ItemTitle>
        <ItemDescription>
          <span className="text-foreground">{told.message}</span>
          {[told.detail, machine.program.value]
            .filter((more) => more && more !== told.message)
            .map((more) => ` · ${more}`)}
        </ItemDescription>
      </ItemContent>
      <Since told={told} asOf={asOf} />
      {onAsk && question && (
        <ItemActions>
          <Button variant="outline" size="sm" onClick={() => onAsk(question)}>
            Ask why
          </Button>
        </ItemActions>
      )}
    </Item>
  )
}

/** A running machine: a small tile. An open warning shows as a sign on it, the machine keeps running. */
export function MachineTile({ machine, asOf }: { machine: Machine; asOf: string }) {
  const told = tell(machine, "running")
  const warned = told.detail !== ""
  return (
    // Tiles of one row are equally tall: keep the content at the top, where the sign is.
    <Item variant="outline" size="sm" role="listitem" className="items-start">
      <ItemMedia variant="icon" className="h-5">
        <StateSymbol state={warned ? "warning" : "running"} label={warned ? "Warning" : stateLabel.running} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{machine.machine}</ItemTitle>
        <ItemDescription>{warned ? told.detail : told.message}</ItemDescription>
      </ItemContent>
      <Since told={told} asOf={asOf} />
    </Item>
  )
}
