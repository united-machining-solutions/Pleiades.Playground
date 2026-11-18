import { z } from "zod"

import { instant, machine, machineId, state } from "../machine/contract.ts"

// The contract of the site card: where the machines stand, and what each of them does now. The
// sites and the placements are what people entered in the Sites API; what a machine does comes
// from its topics, as in the list of machines. The backend groups and counts, a display draws.

/** Where the sites and the placements come from: the REST endpoints of the Sites API. */
export const SITES_SOURCE = "Sites API /sites and /placements"

/** How many machines are in one state. */
export const stateCount = z.object({
  state,
  machines: z.number().int().min(1).describe("How many machines are in this state now."),
})
export type StateCount = z.infer<typeof stateCount>

const counts = z
  .array(stateCount)
  .describe("How many machines are in each state now, in the order a display reads the states. A state no machine is in is not listed.")

/** A machine on a site. */
export const placedMachine = z.object({
  machine: machineId.describe("The machine id, which identifies the machine in every topic."),
  displayName: z.string().nullable().describe("The name people know the machine by, as entered in the Sites API, or null."),
  placedAt: instant.describe("When the machine was put on this site, as entered in the Sites API."),
  state: state.describe("What the machine does now, decided by the rules of the machine card."),
  now: machine
    .nullable()
    .describe("What the machine does now, as genui_machine_list says it, or null if it published no value in the last 24 hours."),
})
export type PlacedMachine = z.infer<typeof placedMachine>

/** A hall of a site and the machines in it. */
export const hall = z.object({
  name: z.string().nullable().describe("The name of the hall, or null for the machines of the site placed in no hall."),
  machines: z.array(placedMachine).describe("The machines in the hall, by machine id."),
})
export type Hall = z.infer<typeof hall>

/** A site with its machines, hall by hall. */
export const site = z.object({
  siteId: z.string().describe("The id of the site in the Sites API, the {SiteId} of sites/{SiteId}."),
  company: z.string(),
  name: z.string().describe("The name of the plant."),
  machineCount: z.number().int().min(0).describe("How many machines stand on the site."),
  counts,
  halls: z
    .array(hall)
    .describe("Every hall of the site in the order of the Sites API, a hall without machines too; then, if any, the machines in no hall."),
})
export type Site = z.infer<typeof site>

/** A machine that sends values and stands on no site: a suggestion to place it. */
export const unplacedMachine = z.object({
  machine: machineId.describe("The machine id."),
  state: state.describe("What the machine does now."),
  now: machine.describe(
    "What the machine does now, as genui_machine_list says it: the values a live page starts from. Its topics a page can also build from the machine id. Required: the example app and genui-mcp are built from the same commit and run under the same tag, and a card file comes with genui-mcp itself.",
  ),
})
export type UnplacedMachine = z.infer<typeof unplacedMachine>

/**
 * The site card: every site with the machines on it and how many are in each state, and the
 * machines that send values and stand on no site. A machine is counted on its site, once.
 */
export const siteList = z.object({
  asOf: instant,
  windowSeconds: z.number().describe("How far back the values of the machines were read to find `since`."),
  source: z.literal(SITES_SOURCE),
  machineCount: z.number().int().min(0).describe("How many machines stand on a site, on all sites together."),
  counts,
  sites: z.array(site).describe("Every site, by site id."),
  unplaced: z
    .array(unplacedMachine)
    .describe("The machines that published a value in the last 24 hours and stand on no site, by machine id."),
})
export type SiteList = z.infer<typeof siteList>
