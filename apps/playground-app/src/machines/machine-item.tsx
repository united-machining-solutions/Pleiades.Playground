import type { Machine, State } from "@pleiades/cards/machine/contract.ts"
import { clock, duration } from "@pleiades/cards/machine/format.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { tell } from "@pleiades/cards/machine/tell.ts"
import type { Told } from "@pleiades/cards/machine/tell.ts"
import { Badge } from "@pleiades/cards/ui/badge.tsx"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"

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
 * A machine that needs someone, or is in setup: one row of a list, with the way to its page.
 * With `onAsk`, a machine that needs someone offers the question why. The chat stays open while
 * the page changes.
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
      <ItemActions>
        {onAsk && question && (
          <Button variant="outline" size="sm" onClick={() => onAsk(question)}>
            Ask why
          </Button>
        )}
        {/* A link that looks like the buttons next to it: it leads somewhere, so it stays a link. */}
        <Link
          to="/machines/$machine"
          params={{ machine: machine.machine }}
          search
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          aria-label={`Open ${machine.machine}`}
        >
          <ChevronRightIcon />
        </Link>
      </ItemActions>
    </Item>
  )
}

/**
 * A running machine: a small tile that leads to its page. An open warning shows as a sign on it,
 * the machine keeps running.
 */
export function MachineTile({ machine, asOf }: { machine: Machine; asOf: string }) {
  const told = tell(machine, "running")
  const warned = told.detail !== ""
  return (
    <li>
      {/* Tiles of one row are equally tall: keep the content at the top, where the sign is. */}
      <Item
        variant="outline"
        size="sm"
        // The chat stays open while the page changes.
        render={<Link to="/machines/$machine" params={{ machine: machine.machine }} search />}
        className="h-full items-start"
      >
        <ItemMedia variant="icon" className="h-5">
          <StateSymbol state={warned ? "warning" : "running"} label={warned ? "Warning" : stateLabel.running} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{machine.machine}</ItemTitle>
          <ItemDescription>{warned ? told.detail : told.message}</ItemDescription>
        </ItemContent>
        <Since told={told} asOf={asOf} />
      </Item>
    </li>
  )
}
