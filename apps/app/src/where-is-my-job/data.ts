import type { State } from "@pleiades/cards/machine/contract.ts"

/**
 * The made-up shop floor of the page "Where is My Job?". The page is a basis for discussion: it
 * reads nothing from the stack, and every value here is invented. Nothing else in the app uses it.
 */

/** The three instants a person can look at. */
export type Instant = "past" | "now" | "plan"

export const instants: ReadonlyArray<{ id: Instant; name: string; clock: string }> = [
  { id: "past", name: "Look back", clock: "06:00" },
  { id: "now", name: "Now", clock: "08:42" },
  { id: "plan", name: "Plan", clock: "12:00" },
]

export type StepKind = "program" | "laser" | "punch" | "grind" | "bend" | "pack" | "juice"

/** The state of a station at one instant, its utilisation in percent and the parts waiting at it. */
export type Snapshot = { state: State; load: number; queue: number }

export type Station = {
  id: string
  name: string
  kind: string
  step: StepKind
  /** Where its tile stands on the map, in pixels. */
  x: number
  y: number
  at: Record<Instant, Snapshot>
  current: string
  program: string
  alarm?: string
  /** The last 8 hours and the next 4 hours, as [state, hours]. */
  band: ReadonlyArray<readonly [State, number]>
  done: ReadonlyArray<readonly [string, string]>
  next: ReadonlyArray<readonly [string, string]>
  /** The juice machine: not part of the process, its load is the fill level. */
  juice?: true
}

export const TILE_WIDTH = 130
export const TILE_HEIGHT = 116
export const MAP_WIDTH = 730
export const MAP_HEIGHT = 446

export const stations: ReadonlyArray<Station> = [
  {
    id: "PRG", name: "Programming", kind: "CAM workstation", step: "program", x: 0, y: 148,
    at: { past: { state: "running", load: 80, queue: 5 }, now: { state: "running", load: 60, queue: 3 }, plan: { state: "running", load: 40, queue: 1 } },
    current: "Nesting order A-24130, sheets 1 to 6",
    program: "Sets for every part its sheet and position",
    band: [["running", 3], ["stopped", 1], ["running", 4], ["running", 2], ["stopped", 2]],
    done: [["08:20", "A-24121 · 5 sheets nested"], ["05:50", "A-24117 · 12 sheets nested"]],
    next: [["09:30", "A-24130 · release to cutting"], ["10:45", "A-24133 · nesting"]],
  },
  {
    id: "LAS1", name: "Laser 1", kind: "2D laser cutting", step: "laser", x: 150, y: 0,
    at: { past: { state: "setup", load: 20, queue: 6 }, now: { state: "running", load: 82, queue: 4 }, plan: { state: "running", load: 90, queue: 2 } },
    current: "A-24117 · sheet 8 of 12",
    program: "Program HB_4711.LST",
    band: [["setup", 1], ["running", 3], ["stopped", 0.5], ["running", 3.5], ["running", 2], ["setup", 0.5], ["running", 1.5]],
    done: [["07:46", "A-24117 · sheet 7 (40 parts)"], ["07:05", "A-24112 · sheet 3 of 3"]],
    next: [["09:20", "A-24117 · sheets 9 to 12"], ["11:10", "A-24130 · set up for 3 mm"]],
  },
  {
    id: "LAS2", name: "Laser 2", kind: "2D laser cutting", step: "laser", x: 150, y: 148,
    at: { past: { state: "running", load: 70, queue: 4 }, now: { state: "alarm", load: 54, queue: 6 }, plan: { state: "running", load: 75, queue: 8 } },
    current: "A-24121 · sheet 2 of 5 · halted",
    program: "Program WK_0815.LST",
    alarm: "Cutting head: check the nozzle, since 08:05. 6 parts wait.",
    band: [["running", 4], ["setup", 0.5], ["running", 3], ["alarm", 0.5], ["alarm", 0.75], ["running", 3.25]],
    done: [["07:52", "A-24121 · sheet 1 of 5"], ["06:40", "A-24109 · sheet 4 of 4"]],
    next: [["09:30", "Maintenance: change the nozzle"], ["09:45", "A-24121 · continue sheets 2 to 5"]],
  },
  {
    id: "PUN", name: "Punching", kind: "Punching machine", step: "punch", x: 150, y: 296,
    at: { past: { state: "running", load: 60, queue: 3 }, now: { state: "running", load: 68, queue: 3 }, plan: { state: "setup", load: 45, queue: 5 } },
    current: "A-24125 · sheet 4 of 6",
    program: "Program LB_2201.STA",
    band: [["running", 2], ["setup", 1], ["running", 3], ["stopped", 0.5], ["running", 1.5], ["running", 2], ["setup", 2]],
    done: [["08:10", "A-24125 · sheet 3 of 6"], ["yesterday", "A-24125 · sheets 1 and 2"]],
    next: [["10:00", "A-24125 · sheets 5 and 6"], ["11:30", "A-24131 · change the tool"]],
  },
  {
    id: "GRD", name: "Grinding", kind: "Deburring and grinding", step: "grind", x: 300, y: 148,
    at: { past: { state: "stopped", load: 0, queue: 2 }, now: { state: "setup", load: 38, queue: 12 }, plan: { state: "running", load: 95, queue: 18 } },
    current: "Setup: brush K80 to K120",
    program: "Deburr both sides",
    band: [["stopped", 3], ["running", 2], ["setup", 1], ["running", 1.5], ["setup", 0.5], ["running", 4]],
    done: [["08:20", "A-24112 · 60 parts"], ["07:10", "A-24109 · 32 parts"]],
    next: [["08:55", "A-24117 · sheet 7, 40 parts"], ["10:30", "A-24121 · angles"]],
  },
  {
    id: "BEN", name: "Bending", kind: "Press brake", step: "bend", x: 450, y: 148,
    at: { past: { state: "stopped", load: 0, queue: 0 }, now: { state: "running", load: 74, queue: 5 }, plan: { state: "running", load: 88, queue: 9 } },
    current: "A-24125 · perforated sheet, bend 2 of 3",
    program: "Bending program LB_2201_B",
    band: [["stopped", 4], ["running", 2], ["setup", 0.5], ["running", 1.5], ["running", 4]],
    done: [["08:20", "A-24125 · 30 parts bent"], ["07:40", "A-24125 · tools set up"]],
    next: [["10:40", "A-24117 · bracket, 40 parts"], ["12:40", "A-24121 · angles"]],
  },
  {
    id: "PKG", name: "Packing", kind: "Picking and packing", step: "pack", x: 600, y: 148,
    at: { past: { state: "stopped", load: 0, queue: 0 }, now: { state: "running", load: 45, queue: 2 }, plan: { state: "running", load: 60, queue: 4 } },
    current: "A-24125 · box 3 of 5",
    program: "Shipping today 11:00",
    band: [["stopped", 6], ["running", 0.5], ["running", 1.5], ["running", 2], ["stopped", 2]],
    done: [["08:25", "A-24125 · box 2 of 5"]],
    next: [["11:30", "A-24117 · 4 boxes"], ["13:30", "A-24121 · pallet"]],
  },
  {
    id: "JUI", name: "Juice machine", kind: "Cocktails for the team", step: "juice", x: 0, y: 300, juice: true,
    at: { past: { state: "stopped", load: 100, queue: 0 }, now: { state: "running", load: 62, queue: 37 }, plan: { state: "alarm", load: 18, queue: 81 } },
    current: "Mixing a passion fruit spritz for meeting room 2",
    program: "Recipe 7 · no ice",
    band: [["stopped", 2], ["running", 0.5], ["stopped", 3], ["running", 1], ["running", 1.5], ["stopped", 2], ["running", 2]],
    done: [["08:30", "Passion fruit spritz × 4"], ["08:05", "Espresso tonic × 2"]],
    next: [["12:00", "Lunch round, about 20 cocktails"], ["13:30", "Refill the orange juice"]],
  },
]

/** How the juice machine calls its states: it mixes, waits, or runs dry. */
export const juiceLabel: Partial<Record<State, string>> = { running: "Mixing", stopped: "Ready", alarm: "Almost empty" }

export const stepName: Record<string, string> = {
  PRG: "Programming", LAS1: "Laser cutting", LAS2: "Laser cutting", PUN: "Punching", GRD: "Grinding", BEN: "Bending", PKG: "Packing",
}

/** The lines of the material flow, as horizontal and vertical segments [axis, from, to, at]. */
export const edges: Record<string, ReadonlyArray<readonly ["h" | "v", number, number, number]>> = {
  "PRG>LAS1": [["h", 130, 140, 206], ["v", 140, 58, 206], ["h", 140, 150, 58]],
  "PRG>LAS2": [["h", 130, 150, 206]],
  "PRG>PUN": [["h", 130, 140, 206], ["v", 140, 206, 354], ["h", 140, 150, 354]],
  "LAS1>GRD": [["h", 280, 290, 58], ["v", 290, 58, 206], ["h", 290, 300, 206]],
  "LAS2>GRD": [["h", 280, 300, 206]],
  "PUN>GRD": [["h", 280, 290, 354], ["v", 290, 206, 354], ["h", 290, 300, 206]],
  "GRD>BEN": [["h", 430, 450, 206]],
  "BEN>PKG": [["h", 580, 600, 206]],
}

export type Part = {
  id: string
  name: string
  order: string
  sheet: number
  position: number
  quantity: number
  material: string
  due: string
  route: ReadonlyArray<string>
  /** At which step of its route the part is at each instant. */
  pos: Record<Instant, number>
  times: ReadonlyArray<string>
  notes: ReadonlyArray<string>
  /** What the part is known by, and from which step on: [label, value, step]. */
  ids: ReadonlyArray<readonly [string, string | null, number]>
}

export const parts: ReadonlyArray<Part> = [
  {
    id: "BT-4711-023", name: "Bracket left", order: "A-24117", sheet: 7, position: 23, quantity: 480, material: "1.4301 · 2 mm", due: "Ships today 14:00",
    route: ["PRG", "LAS1", "GRD", "BEN", "PKG"], pos: { past: 0, now: 2, plan: 3 },
    times: ["05:50", "07:46", "08:31", "10:40", "11:30"],
    notes: ["Sheet 7, position 23 set", "Cut in 6 min, into bin K-17", "Sheet 7 in the queue, place 3", "Bend 90°, 2 bends", "Box 2 of 4"],
    ids: [["Order", "A-24117", 0], ["Sheet · position", "7 · 23", 0], ["Bin", "K-17", 1], ["Box", "2 of 4", 4]],
  },
  {
    id: "BT-4711-024", name: "Bracket left", order: "A-24117", sheet: 7, position: 24, quantity: 480, material: "1.4301 · 2 mm", due: "Ships today 14:00",
    route: ["PRG", "LAS1", "GRD", "BEN", "PKG"], pos: { past: 0, now: 2, plan: 3 },
    times: ["05:50", "07:46", "08:31", "10:40", "11:30"],
    notes: ["Sheet 7, position 24 set", "Cut in 6 min, into bin K-17", "Sheet 7 in the queue, place 3", "Bend 90°, 2 bends", "Box 2 of 4"],
    ids: [["Order", "A-24117", 0], ["Sheet · position", "7 · 24", 0], ["Bin", "K-17", 1], ["Box", "2 of 4", 4]],
  },
  {
    id: "WK-0815-007", name: "Angle 90°", order: "A-24121", sheet: 2, position: 7, quantity: 120, material: "S235 · 3 mm", due: "Ships tomorrow 10:00",
    route: ["PRG", "LAS2", "GRD", "BEN", "PKG"], pos: { past: 0, now: 1, plan: 2 },
    times: ["05:30", "08:01", "10:30", "12:40", "13:30"],
    notes: ["Sheet 2, position 7 set", "Sheet 2 of 5, cut halted", "Break the edges", "Bend 90°", "Pallet 1"],
    ids: [["Order", "A-24121", 0], ["Sheet · position", "2 · 7", 0], ["Bin", null, 1], ["Pallet", null, 4]],
  },
  {
    id: "LB-2201-112", name: "Perforated sheet", order: "A-24125", sheet: 1, position: 112, quantity: 300, material: "DC01 · 1.5 mm", due: "Ships today 11:00",
    route: ["PRG", "PUN", "GRD", "BEN", "PKG"], pos: { past: 2, now: 3, plan: 4 },
    times: ["yesterday 14:20", "yesterday 16:05", "06:30", "07:55", "10:00"],
    notes: ["Sheet 1, position 112 set", "64 holes and the contour punched, into bin K-09", "Deburred", "Bend 2 of 3", "Box 3 of 5"],
    ids: [["Order", "A-24125", 0], ["Sheet · position", "1 · 112", 0], ["Bin", "K-09", 1], ["Box", "3 of 5", 4]],
  },
]

export const stationById: Record<string, Station> = Object.fromEntries(stations.map((one) => [one.id, one]))
