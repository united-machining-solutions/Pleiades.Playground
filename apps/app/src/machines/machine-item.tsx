import type { Machine, State } from "@pleiades/cards/machine/contract.ts"
import { clock, duration } from "@pleiades/cards/machine/format.ts"
import { titleOf } from "@pleiades/cards/machine/in-words.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { tell } from "@pleiades/cards/machine/tell.ts"
import type { Told } from "@pleiades/cards/machine/tell.ts"
import { Badge } from "@pleiades/ui/components/badge"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"
import { Fragment } from "react"
import type { ReactNode } from "react"

import { Button } from "@pleiades/ui/components/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@pleiades/ui/components/item"

import { chatOf } from "@/chat/ask.ts"

/**
 * A machine id that may break onto a new line after "_" as it does after "-", and nowhere else:
 * `alcyone-machines_AX-400_P-04` keeps its parts whole.
 */
function Breakable({ text }: { text: string }) {
  return text.split(/(?<=_)/).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <wbr />}
      {part}
    </Fragment>
  ))
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
 * A machine: one row of a list, with the way to its page. The whole row leads there: its title is the one
 * link of the row, and the link covers the row, so a click anywhere on it opens the page while a person
 * reading it with the keyboard or a screen reader meets one link. The buttons of the row lie above it and
 * stay clicks of their own; the arrow at the end only shows that the row leads somewhere.
 * With `onAsk`, a machine that needs someone offers the question why. The chat stays open while
 * the page changes. With `name`, the name people know the machine by is its title, and what it
 * is comes first in the line below. `what` says what it is where its values do not, as for a
 * machine known by its id only. Without `linked`, the row does not lead to the page: a machine that
 * sent no value in the last 24 hours has none. `actions` are what else can be done with the machine,
 * before the way to its page.
 */
export function MachineRow({
  machine,
  state,
  asOf,
  onAsk,
  name,
  what,
  linked = true,
  actions,
}: {
  machine: Machine
  state: State
  asOf: string
  onAsk?: (question: string) => void
  name?: string | null | undefined
  what?: string | undefined
  linked?: boolean
  actions?: ReactNode
}) {
  const told = tell(machine, state)
  const question = why[state]?.(machine.machine)
  const kind = what ?? titleOf(machine)
  const title = name || kind
  return (
    // A row that leads somewhere shows it as the Item of a link does: the colour under the pointer, and the
    // ring of the focus around the whole row while its link has the focus.
    <Item
      role="listitem"
      className={
        linked
          ? "relative hover:bg-muted has-[[data-slot=row-link]:focus-visible]:border-ring has-[[data-slot=row-link]:focus-visible]:ring-[3px] has-[[data-slot=row-link]:focus-visible]:ring-ring/50"
          : undefined
      }
    >
      {/* As tall as the first line, so the sign sits on it. */}
      <ItemMedia variant="icon" className="h-5">
        <StateSymbol state={state} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {linked ? (
            <Link
              to="/sites/$machine"
              params={{ machine: machine.machine }}
              search={chatOf}
              data-slot="row-link"
              className="outline-none after:absolute after:inset-0"
            >
              {title}
            </Link>
          ) : (
            title
          )}
          <Badge variant="outline">{stateLabel[state]}</Badge>
        </ItemTitle>
        <ItemDescription>
          {name && (
            <>
              <Breakable text={kind} />
              {" · "}
            </>
          )}
          <span className="text-foreground">{told.message}</span>
          {[told.detail, machine.program.value]
            .filter((more) => more && more !== told.message)
            .map((more) => ` · ${more}`)}
        </ItemDescription>
      </ItemContent>
      <Since told={told} asOf={asOf} />
      {/* Its buttons are positioned after the link, so they lie above the area of the link; between them a click
          still opens the page. */}
      <ItemActions className="*:relative">
        {onAsk && question && (
          <Button variant="outline" size="sm" onClick={() => onAsk(question)}>
            Ask why
          </Button>
        )}
        {actions}
        {linked && (
          <span aria-hidden className="pointer-events-none flex size-8 items-center justify-center text-muted-foreground">
            <ChevronRightIcon />
          </span>
        )}
      </ItemActions>
    </Item>
  )
}
