import { Badge } from "@pleiades/ui/components/badge"
import type { CSSProperties } from "react"

import { stateLabel } from "../machine/state.ts"
import { StateSymbol } from "../machine/state-symbol.tsx"
import type { Hall, PlacedMachine } from "./contract.ts"
import { titleOfPlaced } from "./in-words.ts"
import { lineEvery, planOf, waitingOf } from "./plan.ts"

/** The lines of the floor, one every few metre (`lineEvery`). */
const floor: CSSProperties = {
  backgroundImage: [
    "linear-gradient(to right, var(--border) 1px, transparent 1px)",
    "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
  ].join(", "),
}

/** A metre of the plan is never drawn smaller than this, in rem: then the signs of two neighbours do not meet. */
const SMALLEST_METRE = 1.75

/**
 * The plan of a hall, seen from above: its floor with lines, and each machine of the hall as a sign with
 * its state and its name. A machine with a position stands there; one without waits in rows below, with a
 * dashed edge. A plan too large for its place is scrolled sideways. The plan draws what `genui_site_list`
 * returned and computes nothing but where the waiting machines go (plan.ts).
 */
export function HallPlan({ hall }: { hall: Hall }) {
  const plan = planOf(hall.machines)
  const waiting = waitingOf(hall.machines)
  const name = hall.name ?? "No hall"
  const every = lineEvery(plan.width)
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="overflow-x-auto rounded-lg border">
        <ul
          aria-label={`Plan of ${name}: ${plan.width} by ${plan.depth} metre, ${hall.machines.length} ${hall.machines.length === 1 ? "machine" : "machines"}`}
          className="relative w-full bg-muted/40"
          style={{
            minWidth: `${plan.width * SMALLEST_METRE}rem`,
            aspectRatio: `${plan.width} / ${plan.depth}`,
            ...floor,
            backgroundSize: `${(100 * every) / plan.width}% ${(100 * every) / plan.depth}%`,
          }}
        >
          {plan.spots.map(({ machine, x, y, waiting: waits }) => (
            <MachineSign key={machine.machine} placed={machine} left={(x / plan.width) * 100} top={(y / plan.depth) * 100} waits={waits} />
          ))}
        </ul>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {plan.width} × {plan.depth} m, a line every {every === 1 ? "metre" : `${every} m`}
        {waiting > 0 && ` · ${waiting} of ${hall.machines.length} without a position, drawn with a dashed edge`}
      </figcaption>
    </figure>
  )
}

/** A machine on the plan: the sign of its state, its name, and its state in words below. */
function MachineSign({ placed, left, top, waits }: { placed: PlacedMachine; left: number; top: number; waits: boolean }) {
  return (
    <li className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }} title={placed.machine}>
      <Badge variant="outline" className={`h-auto max-w-40 flex-col items-start gap-0 bg-card px-2 py-1 text-left shadow-xs ${waits ? "border-dashed" : ""}`}>
        <span className="flex max-w-full items-center gap-1.5 text-sm font-medium">
          <StateSymbol state={placed.state} />
          <span className="truncate">{titleOfPlaced(placed)}</span>
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {stateLabel[placed.state]}
          {waits && <span className="sr-only">, without a position</span>}
        </span>
      </Badge>
    </li>
  )
}
