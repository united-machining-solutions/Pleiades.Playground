import { z } from "zod"

import { instant, machineId, state } from "../machine/contract.ts"

// The contract of the shop floor card: the hall with every machine at its place, whether it runs,
// and for each one that does not, why. The backend decides all of it, from the list of machines and
// the plan of the hall; the card draws it and computes nothing but the wording and the drawing.

/** Why a machine does not run, in the words of the machine card, and where that comes from. */
export const reason = z.object({
  message: z.string().describe("What is the matter, for example the title of the open error."),
  detail: z.string().describe("The quieter line below it, for example the number of the error."),
  since: instant.nullable().describe("Since when it has been so, or null if that is not known."),
  atLeast: z.boolean().describe("True if it was so before the values that were read: `since` is only the earliest time known."),
  topic: z.string().describe("The MQTT topic the reason comes from: a notification, or the reading that says it."),
})
export type Reason = z.infer<typeof reason>

const metre = z.number().describe("In metre.")

/**
 * Where a thing stands on the plan of the hall, in metre: `x` from the left wall, `y` from the back
 * wall, the corner nearest to both. `width` runs along x, `depth` along y.
 */
export const place = z.object({ x: metre, y: metre, width: metre, depth: metre })
export type Place = z.infer<typeof place>

/** One machine in the hall. */
export const station = z.object({
  machine: machineId.describe("The machine id."),
  state,
  running: z.boolean().describe("True if the machine runs a program now (state `running`)."),
  reason: reason.nullable().describe("Why the machine does not run. Null for a machine that runs."),
  program: z.string().nullable().describe("The active program, or null if none is known or the machine has no data."),
  place: place.describe("Where the machine stands, from the plan of the hall."),
  topics: z.array(z.string()).describe("The MQTT topics the state of the machine was decided from."),
})
export type Station = z.infer<typeof station>

/** What else stands in the hall: it is drawn, and says nothing about the machines. */
export const fixture = z.object({
  kind: z.enum(["cell", "aisle", "rack", "vehicle", "sign"]).describe(
    "`cell` a line on the floor around a machine cell, `aisle` a walkway, `rack` a storage rack with pallets, `vehicle` a forklift, `sign` a label on the floor.",
  ),
  place,
  label: z.string().nullable(),
})
export type Fixture = z.infer<typeof fixture>

/** The plan of the hall: its size and what stands in it besides the machines. */
export const hall = z.object({
  name: z.string(),
  width: metre,
  depth: metre,
  fixtures: z.array(fixture),
  source: z.string().describe("Where the plan comes from."),
})
export type Hall = z.infer<typeof hall>

/** The shop floor: the hall, every machine at its place in the order of the list, and how many do not run. */
export const shopfloorShow = z.object({
  asOf: instant,
  hall,
  machines: z.array(station),
  notRunning: z.number().int().describe("How many of the machines do not run now."),
})
export type ShopfloorShow = z.infer<typeof shopfloorShow>
