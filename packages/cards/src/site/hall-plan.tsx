import { Badge } from "@pleiades/ui/components/badge"
import { useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react"

import { stateLabel } from "../machine/state.ts"
import { StateSymbol } from "../machine/state-symbol.tsx"
import type { Hall, PlacedMachine, Position } from "./contract.ts"
import { titleOfPlaced } from "./in-words.ts"
import { STEP, lineEvery, planOf, positionAt, waitingOf } from "./plan.ts"
import type { Plan, Spot } from "./plan.ts"

/** The lines of the floor, one every few metre (`lineEvery`). */
const floor: CSSProperties = {
  backgroundImage: [
    "linear-gradient(to right, var(--border) 1px, transparent 1px)",
    "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
  ].join(", "),
}

/** A metre of the plan is never drawn smaller than this, in rem: then the signs of two neighbours do not meet. */
const SMALLEST_METRE = 1.75

/** How far a pointer goes, in pixels, before a sign follows it: less is a tap. */
const TAP = 4

/** A machine while it is dragged: where its sign is now, in metre of the drawing. */
type Dragged = { machine: string; x: number; y: number }

/**
 * The plan of a hall, seen from above: its floor with lines, and each machine of the hall as a sign with
 * its state and its name. A machine with a position stands there; one without waits in rows below, with a
 * dashed edge. A plan too large for its place is scrolled sideways. The plan draws what `genui_site_list`
 * returned and computes nothing but where the waiting machines go (plan.ts).
 *
 * With `onMove` a person says where a machine stands: a sign is dragged, with a finger or the mouse, and
 * dropped; or moved half a metre with an arrow key while it has the focus. `onMove` gets the position, in
 * metre, and keeps it. Without `onMove` the plan only shows.
 */
export function HallPlan({ hall, onMove }: { hall: Hall; onMove?: (machine: string, position: Position) => void }) {
  const plan = planOf(hall.machines)
  const waiting = waitingOf(hall.machines)
  const name = hall.name ?? "No hall"
  const every = lineEvery(plan.width)
  const drawing = useRef<HTMLUListElement>(null)
  // What is drawn while a sign is dragged, and next to it what the handlers read: where the pointer went
  // down and whether it has gone far enough to be a drag.
  const [dragged, setDragged] = useState<Dragged>()
  const held = useRef<Dragged & { fromX: number; fromY: number; went: boolean }>(undefined)

  /** A point of the screen as a point of the drawing, in metre. */
  const pointOf = (event: PointerEvent): { x: number; y: number } | undefined => {
    const box = drawing.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return undefined
    return {
      x: Math.min(Math.max(((event.clientX - box.left) / box.width) * plan.width, 0), plan.width),
      y: Math.min(Math.max(((event.clientY - box.top) / box.height) * plan.depth, 0), plan.depth),
    }
  }

  return (
    <figure className="flex flex-col gap-1.5">
      <div className="overflow-x-auto rounded-lg border">
        <ul
          ref={drawing}
          aria-label={`Plan of ${name}: ${plan.width} by ${plan.depth} metre, ${hall.machines.length} ${hall.machines.length === 1 ? "machine" : "machines"}`}
          className="relative w-full bg-muted/40"
          style={{
            minWidth: `${plan.width * SMALLEST_METRE}rem`,
            aspectRatio: `${plan.width} / ${plan.depth}`,
            ...floor,
            backgroundSize: `${(100 * every) / plan.width}% ${(100 * every) / plan.depth}%`,
          }}
        >
          {plan.spots.map((spot) => (
            <MachineSign
              key={spot.machine.machine}
              spot={spot}
              plan={plan}
              dragged={dragged?.machine === spot.machine.machine ? dragged : undefined}
              {...(onMove && {
                moving: {
                  begin: (event) => {
                    // The sign follows only once the pointer has gone a few pixels: a tap moves nothing.
                    held.current = { machine: spot.machine.machine, fromX: event.clientX, fromY: event.clientY, x: spot.x, y: spot.y, went: false }
                  },
                  drag: (event) => {
                    const now = held.current
                    const point = pointOf(event)
                    if (!now || now.machine !== spot.machine.machine || !point) return
                    if (!now.went && Math.hypot(event.clientX - now.fromX, event.clientY - now.fromY) < TAP) return
                    held.current = { ...now, ...point, went: true }
                    setDragged({ machine: now.machine, ...point })
                  },
                  drop: () => {
                    const now = held.current
                    held.current = undefined
                    setDragged(undefined)
                    if (now?.went && now.machine === spot.machine.machine) onMove(now.machine, positionAt(now.x, now.y))
                  },
                  cancel: () => {
                    held.current = undefined
                    setDragged(undefined)
                  },
                  step: (right, down) => {
                    const from = positionAt(spot.x, spot.y)
                    const to = positionAt(spot.x + right * STEP, spot.y + down * STEP)
                    // A machine that waits gets the position of its place in the row with the first key.
                    if (spot.waiting || to.x !== from.x || to.y !== from.y) onMove(spot.machine.machine, to)
                  },
                },
              })}
            />
          ))}
        </ul>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {plan.width} × {plan.depth} m, a line every {every === 1 ? "metre" : `${every} m`}
        {waiting > 0 && ` · ${waiting} of ${hall.machines.length} without a position, drawn with a dashed edge`}
        {onMove && hall.machines.length > 0 && " · Drag a machine to where it stands"}
      </figcaption>
    </figure>
  )
}

/** What a sign does when a person can move it. */
type Moving = {
  begin: (event: PointerEvent) => void
  drag: (event: PointerEvent) => void
  drop: () => void
  cancel: () => void
  /** One step with an arrow key: to the right and down, each -1, 0 or 1. */
  step: (right: number, down: number) => void
}

const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** A machine on the plan: the sign of its state, its name, and its state in words below. */
function MachineSign({ spot, plan, dragged, moving }: { spot: Spot<PlacedMachine>; plan: Plan<PlacedMachine>; dragged?: Dragged | undefined; moving?: Moving }) {
  const { machine: placed, waiting: waits } = spot
  const at = dragged ?? spot
  const title = titleOfPlaced(placed)
  const where = waits ? "without a position" : `at ${positionAt(spot.x, spot.y).x} m, ${positionAt(spot.x, spot.y).y} m`
  return (
    <li
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${moving ? "cursor-grab touch-none rounded-4xl outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing" : ""} ${dragged ? "z-10" : ""}`}
      style={{ left: `${(at.x / plan.width) * 100}%`, top: `${(at.y / plan.depth) * 100}%` }}
      title={placed.machine}
      {...(moving && {
        tabIndex: 0,
        "aria-label": `${title}, ${stateLabel[placed.state]}, ${where}. Move it with the arrow keys.`,
        onPointerDown: (event: PointerEvent<HTMLLIElement>) => {
          if (event.button !== 0) return
          // A pointer made by a script cannot be captured; the drag works without it while the pointer stays on the sign.
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            // Nothing to do.
          }
          moving.begin(event)
        },
        onPointerMove: moving.drag,
        onPointerUp: moving.drop,
        onPointerCancel: moving.cancel,
        onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => {
          const step = arrows[event.key]
          if (!step) return
          event.preventDefault()
          moving.step(...step)
        },
      })}
    >
      <Badge
        variant="outline"
        className={`h-auto max-w-40 flex-col items-start gap-0 bg-card px-2 py-1 text-left shadow-xs ${waits && !dragged ? "border-dashed" : ""} ${dragged ? "shadow-md" : ""}`}
      >
        <span className="flex max-w-full items-center gap-1.5 text-sm font-medium">
          <StateSymbol state={placed.state} />
          <span className="truncate">{title}</span>
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {stateLabel[placed.state]}
          {waits && <span className="sr-only">, without a position</span>}
        </span>
      </Badge>
    </li>
  )
}
