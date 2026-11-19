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

/** How far a pointer goes, in pixels, before a sign follows it: less is a tap. A finger is less steady than a mouse. */
const tapOf = (pointerType: string) => (pointerType === "touch" ? 10 : 4)

/** A machine while it is dragged: where its sign is now, in metre of the drawing. */
type Dragged = { machine: string; x: number; y: number }

/**
 * The one pointer that holds a sign: where it went down, how far the middle of the sign is from it, in
 * metre, and whether it has gone far enough to be a drag.
 */
type Held = Dragged & { pointer: number; fromX: number; fromY: number; offsetX: number; offsetY: number; went: boolean }

/**
 * The plan of a hall, seen from above: its floor with lines, and each machine of the hall as a sign with
 * its state and its name. A machine with a position stands there; one without waits in rows below, with a
 * dashed edge. A plan too large for its place is scrolled sideways. The plan draws what `genui_site_list`
 * returned and computes nothing but where the waiting machines go (plan.ts).
 *
 * With `onMove` a person says where a machine stands: a sign is dragged, with a finger or the mouse, and
 * dropped; or moved half a metre with an arrow key while it has the focus. One sign is dragged at a time.
 * `onMove` gets the position, in metre, and keeps it. Without `onMove` the plan only shows.
 */
export function HallPlan({ hall, onMove }: { hall: Hall; onMove?: (machine: string, position: Position) => void }) {
  const plan = planOf(hall.machines)
  const waiting = waitingOf(hall.machines)
  const name = hall.name ?? "No hall"
  const every = lineEvery(plan.width)
  const drawing = useRef<HTMLUListElement>(null)
  // What is drawn while a sign is dragged, and next to it what the handlers read.
  const [dragged, setDragged] = useState<Dragged>()
  const held = useRef<Held>(undefined)

  /** A point of the screen as a point of the drawing, in metre; it may lie outside the drawing. */
  const pointOf = (event: PointerEvent): { x: number; y: number } | undefined => {
    const box = drawing.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return undefined
    return { x: ((event.clientX - box.left) / box.width) * plan.width, y: ((event.clientY - box.top) / box.height) * plan.depth }
  }
  const onThePlan = (x: number, y: number) => ({ x: Math.min(Math.max(x, 0), plan.width), y: Math.min(Math.max(y, 0), plan.depth) })
  const letGo = () => {
    held.current = undefined
    setDragged(undefined)
  }

  const movingOf = (spot: Spot<PlacedMachine>): Moving | undefined =>
    onMove && {
      begin: (event) => {
        // One sign at a time: a second finger takes nothing while the first holds a sign.
        const point = pointOf(event)
        if (held.current || !point) return false
        held.current = {
          machine: spot.machine.machine,
          pointer: event.pointerId,
          fromX: event.clientX,
          fromY: event.clientY,
          // The sign keeps its place under the pointer: it does not jump to it.
          offsetX: spot.x - point.x,
          offsetY: spot.y - point.y,
          x: spot.x,
          y: spot.y,
          went: false,
        }
        return true
      },
      drag: (event) => {
        const now = held.current
        const point = pointOf(event)
        if (!now || now.pointer !== event.pointerId || !point) return
        // The sign follows only once the pointer has gone a few pixels: a tap moves nothing.
        if (!now.went && Math.hypot(event.clientX - now.fromX, event.clientY - now.fromY) < tapOf(event.pointerType)) return
        const at = onThePlan(point.x + now.offsetX, point.y + now.offsetY)
        held.current = { ...now, ...at, went: true }
        setDragged({ machine: now.machine, ...at })
      },
      drop: (event) => {
        const now = held.current
        if (!now || now.pointer !== event.pointerId) return
        letGo()
        if (now.went) onMove(now.machine, positionAt(now.x, now.y))
      },
      cancel: (event) => {
        if (held.current?.pointer === event.pointerId) letGo()
      },
      step: (right, down) => {
        const from = positionAt(spot.x, spot.y)
        // A machine that waits gets the position of its place in the row with the first key, and moves from there.
        if (spot.waiting) return onMove(spot.machine.machine, from)
        const to = positionAt(spot.x + right * STEP, spot.y + down * STEP)
        if (to.x !== from.x || to.y !== from.y) onMove(spot.machine.machine, to)
      },
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
              moving={movingOf(spot)}
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
  /** A pointer went down on the sign: whether it holds the sign now. */
  begin: (event: PointerEvent) => boolean
  drag: (event: PointerEvent) => void
  drop: (event: PointerEvent) => void
  cancel: (event: PointerEvent) => void
  /** One step with an arrow key: to the right and down, each -1, 0 or 1. */
  step: (right: number, down: number) => void
}

const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/** A machine on the plan: the sign of its state, its name, and its state in words below. */
function MachineSign({
  spot,
  plan,
  dragged,
  moving,
}: {
  spot: Spot<PlacedMachine>
  plan: Plan<PlacedMachine>
  dragged?: Dragged | undefined
  moving?: Moving | undefined
}) {
  const { machine: placed, waiting: waits } = spot
  const at = dragged ?? spot
  const title = titleOfPlaced(placed)
  const position = positionAt(spot.x, spot.y)
  const where = waits ? "without a position" : `at ${position.x} m, ${position.y} m`
  return (
    <li
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${moving ? "cursor-grab touch-none rounded-4xl outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing" : ""} ${dragged ? "z-10" : ""}`}
      style={{ left: `${(at.x / plan.width) * 100}%`, top: `${(at.y / plan.depth) * 100}%` }}
      title={placed.machine}
      {...(moving && {
        tabIndex: 0,
        "aria-label": `${title}, ${stateLabel[placed.state]}, ${where}. Move it with the arrow keys.`,
        onPointerDown: (event: PointerEvent<HTMLLIElement>) => {
          if (event.button !== 0 || !moving.begin(event)) return
          // A pointer made by a script cannot be captured; the drag works without it while the pointer stays on the sign.
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            // Nothing to do.
          }
        },
        onPointerMove: moving.drag,
        onPointerUp: moving.drop,
        onPointerCancel: moving.cancel,
        // After a drop the capture is lost too: then nothing is held any more, and this does nothing.
        onLostPointerCapture: moving.cancel,
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
