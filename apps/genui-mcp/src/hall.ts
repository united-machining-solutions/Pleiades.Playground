import type { Fixture, Hall, Place } from "@pleiades/cards/shopfloor/contract.ts"

// The plan of the hall of the demo: where the simulated machines stand, and what else is in the hall.
// It is made up, for the simulators of compose.yaml. A hall of your own: change the places here. A
// machine that is not in the plan gets a free place in the row at the front.

const SOURCE = "apps/genui-mcp/src/hall.ts, the plan of the demo hall"

/** Where each machine stands, by its serial number, in metre. */
const machinePlaces: Record<string, Place> = {
  "M-02": { x: 6.5, y: 4, width: 9, depth: 6 },
  "P-04": { x: 18.5, y: 4, width: 7, depth: 5.5 },
  "P-07": { x: 28.5, y: 4, width: 7, depth: 5.5 },
}

const fixtures: ReadonlyArray<Fixture> = [
  // The cells: lines on the floor around each machine, with a label.
  { kind: "cell", place: { x: 5.5, y: 2.5, width: 11, depth: 8.5 }, label: "Cell 1 · Milling" },
  { kind: "cell", place: { x: 17.5, y: 2.5, width: 9, depth: 8.5 }, label: "Cell 2 · Turning" },
  { kind: "cell", place: { x: 27.5, y: 2.5, width: 9, depth: 8.5 }, label: "Cell 3 · Turning" },
  // The main aisle across the hall, and one up to the gate.
  { kind: "aisle", place: { x: 4, y: 12.5, width: 34, depth: 3 }, label: "Main aisle" },
  { kind: "aisle", place: { x: 18, y: 15.5, width: 3, depth: 8.5 }, label: null },
  // Storage along the left wall and in the front right.
  { kind: "rack", place: { x: 0.5, y: 2, width: 2, depth: 18 }, label: "Raw material" },
  { kind: "rack", place: { x: 24, y: 18, width: 13, depth: 2 }, label: "Finished parts" },
  { kind: "rack", place: { x: 24, y: 21, width: 13, depth: 2 }, label: null },
  // A buffer zone for pallets, and the forklifts.
  { kind: "cell", place: { x: 5, y: 17, width: 10, depth: 5.5 }, label: "Buffer · Pallets" },
  { kind: "vehicle", place: { x: 9, y: 13.2, width: 1.2, depth: 2.2 }, label: null },
  { kind: "vehicle", place: { x: 33, y: 13.4, width: 1.2, depth: 2.2 }, label: null },
  { kind: "sign", place: { x: 18, y: 23.2, width: 3, depth: 0.6 }, label: "Gate" },
]

const HALL = { name: "Hall 1", width: 40, depth: 24 }

/** The plan of the hall. */
export function hallPlan(): Hall {
  return { ...HALL, fixtures: [...fixtures], source: SOURCE }
}

/**
 * Where the machines of the list stand: from the plan, or else a free place in the row between the
 * main aisle and the racks at the front, one after the other.
 */
export function placesOf(machines: ReadonlyArray<string>): Map<string, Place> {
  const places = new Map<string, Place>()
  let next = 22
  for (const machine of machines) {
    const planned = machinePlaces[machine]
    if (planned) {
      places.set(machine, planned)
      continue
    }
    places.set(machine, { x: next, y: 15.7, width: 3, depth: 2 })
    next += 4
  }
  return places
}
