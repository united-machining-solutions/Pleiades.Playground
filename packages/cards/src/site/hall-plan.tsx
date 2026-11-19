import { Badge } from "@pleiades/ui/components/badge"
import type { CSSProperties } from "react"

import { stateLabel } from "../machine/state.ts"
import { StateSymbol } from "../machine/state-symbol.tsx"
import type { Hall, PlacedMachine } from "./contract.ts"
import { titleOfPlaced } from "./in-words.ts"
import { planOf, waitingOf } from "./plan.ts"

/** The lines of the floor: one every metre, one a little darker every five. */
const floor: CSSProperties = {
  backgroundImage: [
    "linear-gradient(to right, var(--border) 1px, transparent 1px)",
    "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
  ].join(", "),
}

/**
 * The plan of a hall, seen from above: its floor with a line every metre, and each machine of the hall as
 * a sign with its state and its name. A machine with a position stands there; one without waits in rows
 * below, with a dashed edge. The plan draws what `genui_site_list` returned and computes nothing but where
 * the waiting machines go (plan.ts).
 */
export function HallPlan({ hall }: { hall: Hall }) {
  const plan = planOf(hall.machines)
  const waiting = waitingOf(hall.machines)
  const name = hall.name ?? "No hall"
  return (
    <figure className="flex flex-col gap-1.5">
      <div
        role="group"
        aria-label={`Plan of ${name}: ${plan.width} by ${plan.depth} metre`}
        className="relative w-full overflow-hidden rounded-lg border bg-muted/40"
        style={{ aspectRatio: `${plan.width} / ${plan.depth}`, ...floor, backgroundSize: `${100 / plan.width}% ${100 / plan.depth}%` }}
      >
        {plan.spots.map(({ machine, x, y, waiting: waits }) => (
          <MachineSign key={machine.machine} placed={machine} left={(x / plan.width) * 100} top={(y / plan.depth) * 100} waits={waits} />
        ))}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {plan.width} × {plan.depth} m, a line every metre
        {waiting > 0 && ` · ${waiting} of ${hall.machines.length} without a position, drawn with a dashed edge`}
      </figcaption>
    </figure>
  )
}

/** A machine on the plan: the sign of its state, its name, and its state in words below. */
function MachineSign({ placed, left, top, waits }: { placed: PlacedMachine; left: number; top: number; waits: boolean }) {
  const title = titleOfPlaced(placed)
  return (
    <Badge
      variant="outline"
      title={`${placed.machine}${waits ? ", without a position" : ""}`}
      className={`absolute h-auto max-w-[45%] -translate-x-1/2 -translate-y-1/2 flex-col items-start gap-0 bg-card px-2 py-1 text-left shadow-xs ${waits ? "border-dashed" : ""}`}
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      <span className="flex max-w-full items-center gap-1.5 text-sm font-medium">
        <StateSymbol state={placed.state} />
        <span className="truncate">{title}</span>
      </span>
      <span className="text-xs font-normal text-muted-foreground">{stateLabel[placed.state]}</span>
    </Badge>
  )
}
