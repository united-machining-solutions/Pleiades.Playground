import type { Machine, MachineList, State } from "@pleiades/cards/machine/contract.ts"
import { stateOf, stateOrder } from "@pleiades/cards/machine/state.ts"
import { SITES_SOURCE } from "@pleiades/cards/site/contract.ts"
import type { Hall, PlacedMachine, SiteList, StateCount } from "@pleiades/cards/site/contract.ts"

import { readPlacements, readSites } from "./apis.ts"
import type { Apis, Placement, StoredSite } from "./apis.ts"
import { listMachines } from "./machines.ts"

// Where the machines stand: the sites and placements people entered in the Sites API, put
// together with what every machine does now. The machines that send values and stand on no site
// are the suggestions. Groups and counts are made here, a display only draws them.

/** How many machines are in each state, in the order a display reads the states. */
export function countsOf(states: ReadonlyArray<State>): Array<StateCount> {
  return stateOrder.flatMap((state) => {
    const machines = states.filter((one) => one === state).length
    return machines > 0 ? [{ state, machines }] : []
  })
}

const byMachineId = (a: { machine: string }, b: { machine: string }) => a.machine.localeCompare(b.machine)

/**
 * The sites with their machines, hall by hall, and the machines that send values and stand on
 * no site. A machine that published nothing in the last 24 hours is not in `list`: on a site it
 * has no data, and it is no suggestion.
 */
export function sitesOf(
  sites: ReadonlyArray<StoredSite>,
  placements: ReadonlyArray<Placement>,
  list: MachineList,
): SiteList {
  const sending = new Map<string, Machine>(list.machines.map((one) => [one.machine, one]))
  const placedOn = (siteId: string) => placements.filter((one) => one.siteId === siteId)
  const placedMachine = (placement: Placement): PlacedMachine => {
    const now = sending.get(placement.machineId) ?? null
    return {
      machine: placement.machineId,
      displayName: placement.displayName,
      placedAt: placement.placedAt,
      state: now === null ? "no-data" : stateOf(now, list.asOf),
      now,
    }
  }

  const grouped = sites.map((site) => {
    const machines = placedOn(site.siteId).map(placedMachine).sort(byMachineId)
    const hallOf = new Map(placedOn(site.siteId).map((one) => [one.machineId, one.hall]))
    // The Sites API keeps a hall of a placement among the halls of its site. One that is not
    // there all the same is shown after them, so no machine goes missing.
    const strays = [...new Set(machines.flatMap((one) => hallOf.get(one.machine) ?? []))].filter(
      (name) => !site.halls.includes(name),
    )
    const halls: Array<Hall> = [...site.halls, ...strays].map((name) => ({
      name,
      machines: machines.filter((one) => hallOf.get(one.machine) === name),
    }))
    const inNoHall = machines.filter((one) => hallOf.get(one.machine) == null)
    if (inNoHall.length > 0) halls.push({ name: null, machines: inNoHall })
    return {
      siteId: site.siteId,
      company: site.company,
      name: site.name,
      machineCount: machines.length,
      counts: countsOf(machines.map((one) => one.state)),
      halls,
    }
  })

  // The Sites API puts a machine only on a site that exists. One on a site it does not list
  // stands on none that can be shown: while it sends values, it is a suggestion.
  const placed = new Set(
    placements.filter((one) => sites.some((site) => site.siteId === one.siteId)).map((one) => one.machineId),
  )
  const all = grouped.flatMap((site) => site.halls.flatMap((one) => one.machines))
  return {
    asOf: list.asOf,
    windowSeconds: list.windowSeconds,
    source: SITES_SOURCE,
    machineCount: all.length,
    counts: countsOf(all.map((one) => one.state)),
    sites: grouped,
    unplaced: list.machines
      .filter((one) => !placed.has(one.machine))
      .map((one) => ({ machine: one.machine, state: stateOf(one, list.asOf), now: one }))
      .sort(byMachineId),
  }
}

/** Every site with its machines, and the machines that send values and stand on no site. */
export async function listSites(apis: Apis, now = new Date()): Promise<SiteList> {
  const [sites, placements, list] = await Promise.all([readSites(apis), readPlacements(apis), listMachines(apis, now)])
  return sitesOf(sites, placements, list)
}
