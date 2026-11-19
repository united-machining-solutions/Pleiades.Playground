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

/** A machine on the plan: the middle of it, in metre from the upper left corner. */
export type Spot<T> = { machine: T; x: number; y: number; waiting: boolean }

/** The plan of a hall: its size in metre, and where each of its machines goes. */
export type Plan<T> = { width: number; depth: number; spots: Array<Spot<T>> }

const up = (metre: number) => Math.ceil(metre)

/**
 * The plan of a hall. The machines with a position keep it. The others wait in rows of the width of the
 * plan, below the lowest machine that has one, in the order they come in.
 */
export function planOf<T extends Pick<PlacedMachine, "position">>(machines: ReadonlyArray<T>): Plan<T> {
  const placed = machines.flatMap((machine) => (machine.position ? [{ machine, position: machine.position }] : []))
  const waiting = machines.filter((machine) => !machine.position)

  // As wide as the positions need, with half a room on the right of the outermost.
  const width = Math.max(SMALLEST_PLAN.width, up(Math.max(0, ...placed.map((one) => one.position.x)) + ROOM.width / 2))
  const inARow = Math.max(1, Math.floor(width / ROOM.width))
  // The rows of the waiting begin a room below the lowest machine, or at the top of an empty plan.
  const lowest = placed.length === 0 ? 0 : Math.max(...placed.map((one) => one.position.y)) + ROOM.depth / 2
  const rows = Math.ceil(waiting.length / inARow)
  const depth = Math.max(SMALLEST_PLAN.depth, up(lowest + rows * ROOM.depth))

  const spots: Array<Spot<T>> = [
    ...placed.map(({ machine, position }) => ({ machine, ...inside(position, width, depth), waiting: false })),
    ...waiting.map((machine, index) => ({
      machine,
      x: (index % inARow) * ROOM.width + ROOM.width / 2,
      y: lowest + Math.floor(index / inARow) * ROOM.depth + ROOM.depth / 2,
      waiting: true,
    })),
  ]
  return { width, depth, spots }
}

/** A position, kept on the plan. */
function inside(position: Position, width: number, depth: number): Position {
  return { x: Math.min(Math.max(position.x, 0), width), y: Math.min(Math.max(position.y, 0), depth) }
}

/** How many machines of a hall have no position yet. */
export function waitingOf(machines: ReadonlyArray<Pick<PlacedMachine, "position">>): number {
  return machines.filter((machine) => !machine.position).length
}
