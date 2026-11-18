import { HORIZON_SECONDS } from "@pleiades/cards/machine/contract.ts"
import type { State } from "@pleiades/cards/machine/contract.ts"
import { stateOf, stateOrder } from "@pleiades/cards/machine/state.ts"
import type { PlacedMachine, SiteList, StateCount, UnplacedMachine } from "@pleiades/cards/site/contract.ts"

import { machineWith, unknownMachine } from "./machines.ts"
import { machineOf } from "./messages.ts"

// Where the machines stand, kept up to date from the broker. The sites and their halls are what the
// backend read from the Sites API; what each machine on them does comes from the broker, as on Home.
// The state of a machine and the counts of a site follow it by the rules of genui_site_list
// (apps/genui-mcp/src/sites.ts). The machines on no site follow the broker the same way.

/** How many machines are in each state, in the order a display reads the states: as genui_site_list counts. */
export function countsOf(states: ReadonlyArray<State>): Array<StateCount> {
  return stateOrder.flatMap((state) => {
    const machines = states.filter((one) => one === state).length
    return machines > 0 ? [{ state, machines }] : []
  })
}

/**
 * The state of every machine at the instant of the list, on a site or on none, and the counts of the
 * sites that follow from them. The machines on no site are not counted, as genui_site_list does not.
 */
function recounted(list: SiteList): SiteList {
  const placed = (one: PlacedMachine): PlacedMachine => {
    const state = one.now === null ? "no-data" : stateOf(one.now, list.asOf)
    return state === one.state ? one : { ...one, state }
  }
  const sites = list.sites.map((site) => {
    const halls = site.halls.map((hall) => ({ ...hall, machines: hall.machines.map(placed) }))
    return { ...site, halls, counts: countsOf(halls.flatMap((hall) => hall.machines.map((one) => one.state))) }
  })
  const all = sites.flatMap((site) => site.halls.flatMap((hall) => hall.machines))
  const unplaced = list.unplaced.map((one): UnplacedMachine => {
    const state = stateOf(one.now, list.asOf)
    return state === one.state ? one : { ...one, state }
  })
  return { ...list, sites, unplaced, counts: countsOf(all.map((one) => one.state)) }
}

/**
 * What a message of the broker does to the sites. A machine on a site that published nothing in the
 * last 24 hours, and so came without values, gets them with its first sign of life, if that is no
 * older than the backend looks for a machine. A machine on no site follows its messages as well. A
 * topic of a machine the list does not hold changes nothing.
 */
export function sitesWith(list: SiteList, topic: string, payload: string, now = Date.now()): SiteList {
  const id = machineOf(topic)
  if (id === undefined) return list
  let changed = false
  const sites = list.sites.map((site) => ({
    ...site,
    halls: site.halls.map((hall) => ({
      ...hall,
      machines: hall.machines.map((placed) => {
        if (placed.machine !== id) return placed
        const before = placed.now ?? unknownMachine(id)
        const after = machineWith(before, topic, payload, now)
        if (after === before) return placed
        if (placed.now === null && (after.lastValueAt === null || now - Date.parse(after.lastValueAt) > HORIZON_SECONDS * 1000)) {
          return placed
        }
        changed = true
        return { ...placed, now: after }
      }),
    })),
  }))
  const unplaced = list.unplaced.map((one) => {
    if (one.machine !== id) return one
    const after = machineWith(one.now, topic, payload, now)
    if (after === one.now) return one
    changed = true
    return { ...one, now: after }
  })
  return changed ? recounted({ ...list, sites, unplaced }) : list
}

/** The sites at a later instant: a machine that fell silent has no data, and its site counts it so. */
export function sitesAt(list: SiteList, now: string): SiteList {
  return now > list.asOf ? recounted({ ...list, asOf: now }) : list
}
