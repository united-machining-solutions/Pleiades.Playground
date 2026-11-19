import type { PlacedMachine, Position } from "./contract.ts"

// The plan of a hall, seen from above, before it is drawn: how large it is and where every machine of
// the hall goes. A machine with a position stands there. One without waits in rows below the others, so
// no machine goes missing from the plan while nobody said where it stands.
//
// A hall has no size of its own in the Sites API. Its plan is as large as its machines need, and never
// smaller than a small hall, so one machine does not fill the whole picture.

/** The smallest plan, in metre. */
export const SMALLEST_PLAN = { width: 16, depth: 9 }
/** The room a machine takes on the plan, in metre: the room of its sign, not the size of the machine. */
export const ROOM = { width: 4, depth: 3 }
/**
 * The edge around the positions, in metre: half a room on every side, so the sign of a machine at the
 * very corner of its hall is on the plan as a whole. A position is drawn this far in from the upper left
 * corner of the plan.
 */
export const EDGE = { x: ROOM.width / 2, y: ROOM.depth / 2 }

/** A machine on the plan: the middle of its sign, in metre from the upper left corner of the drawing. */
export type Spot<T> = { machine: T; x: number; y: number; waiting: boolean }

/** The plan of a hall: the size of the drawing in metre, and where each of its machines goes on it. */
export type Plan<T> = { width: number; depth: number; spots: Array<Spot<T>> }

const up = (metre: number) => Math.ceil(metre)

/**
 * The plan of a hall. The machines with a position keep it. The others wait in rows of the width of the
 * plan, below the lowest machine that has one, in the order they come in.
 */
export function planOf<T extends Pick<PlacedMachine, "position">>(machines: ReadonlyArray<T>): Plan<T> {
  const placed = machines.flatMap((machine) => (machine.position ? [{ machine, position: machine.position }] : []))
  const waiting = machines.filter((machine) => !machine.position)

  // As wide as the positions need, with the edge on both sides.
  const width = Math.max(SMALLEST_PLAN.width, up(Math.max(0, ...placed.map((one) => one.position.x)) + 2 * EDGE.x))
  const inARow = Math.max(1, Math.floor(width / ROOM.width))
  // The rows of the waiting begin below the room of the lowest machine, or at the top of an empty plan.
  const lowest = placed.length === 0 ? 0 : Math.max(...placed.map((one) => one.position.y)) + 2 * EDGE.y
  const rows = Math.ceil(waiting.length / inARow)
  const depth = Math.max(SMALLEST_PLAN.depth, up(lowest + rows * ROOM.depth))

  const spots: Array<Spot<T>> = [
    ...placed.map(({ machine, position }) => ({ machine, ...drawnAt(position), waiting: false })),
    ...waiting.map((machine, index) => ({
      machine,
      x: (index % inARow) * ROOM.width + ROOM.width / 2,
      y: lowest + Math.floor(index / inARow) * ROOM.depth + ROOM.depth / 2,
      waiting: true,
    })),
  ]
  return { width, depth, spots }
}

/** Where a position is drawn: the edge in from the corner of the plan. A position below zero is none the API takes. */
export function drawnAt(position: Position): Position {
  return { x: Math.max(position.x, 0) + EDGE.x, y: Math.max(position.y, 0) + EDGE.y }
}

/** A position is kept to half a metre: fine enough for a sign, and a number a person can read. */
export const STEP = 0.5
/** The largest distance of a position from the corner of its plan, in metre, as the Sites API keeps it. */
export const FARTHEST = 1000

const stepped = (metre: number) => Math.min(Math.max(Math.round(metre / STEP) * STEP, 0), FARTHEST)

/**
 * The position of a point of the drawing: the other way round of `drawnAt`, kept to half a metre and
 * on the plan. `x` and `y` are in metre from the upper left corner of the drawing.
 */
export function positionAt(x: number, y: number): Position {
  return { x: stepped(x - EDGE.x), y: stepped(y - EDGE.y) }
}

/** How many machines of a hall have no position yet. */
export function waitingOf(machines: ReadonlyArray<Pick<PlacedMachine, "position">>): number {
  return machines.filter((machine) => !machine.position).length
}

/** How many metre lie between two lines of the floor: one on a small plan, five or ten on a large one. */
export function lineEvery(width: number): 1 | 5 | 10 {
  return width <= 60 ? 1 : width <= 300 ? 5 : 10
}
