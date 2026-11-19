import { HORIZON_SECONDS } from "@pleiades/cards/machine/contract.ts"
import type { Machine, State } from "@pleiades/cards/machine/contract.ts"
import { stateOf } from "@pleiades/cards/machine/state.ts"
import type { PlacedMachine, SiteList, UnplacedMachine } from "@pleiades/cards/site/contract.ts"
import { countsOf, needsYouOf, sendingOf } from "@pleiades/cards/site/counts.ts"

import { machineWith, unknownMachine } from "./machines.ts"
import { machineOf } from "./messages.ts"

// Where the machines stand, kept up to date from the broker. The sites and their halls are what the
// backend read from the Sites API; what each machine on them does comes from the broker, as on Home.
// The state of a machine and the counts of a site follow it by the rules of genui_site_list
// (apps/genui-mcp/src/sites.ts), with the same `countsOf`. The machines on no site follow the broker
// the same way. A site, a hall or a machine that did not change stays the same object.

/**
 * Whether a machine sent a value within the hours the backend looks back, at `at`: only then
 * genui_site_list gives it values, and only then its page has something to show.
 */
export function sentLately(machine: Machine | null, at: number): boolean {
  return machine?.lastValueAt != null && at - Date.parse(machine.lastValueAt) <= HORIZON_SECONDS * 1000
}

/**
 * The state of a machine on a site. A machine without values, or with values that are not yet a
 * value of the binding, such as its identity, has no data.
 */
function stateAt(placed: PlacedMachine, asOf: string): State {
  return placed.now === null ? "no-data" : stateOf(placed.now, asOf)
}

/**
 * The state of every machine at the instant of the list, on a site or on none, and the counts of the
 * sites that follow from them, how many send and how many need someone among them. The machines on no site are not counted, as genui_site_list does not.
 */
function recounted(list: SiteList): SiteList {
  let sitesChanged = false
  const sites = list.sites.map((site) => {
    let siteChanged = false
    const halls = site.halls.map((hall) => {
      let hallChanged = false
      const machines = hall.machines.map((one) => {
        const state = stateAt(one, list.asOf)
        if (state === one.state) return one
        hallChanged = true
        return { ...one, state }
      })
      if (!hallChanged) return hall
      siteChanged = true
      return { ...hall, machines }
    })
    if (!siteChanged) return site
    sitesChanged = true
    return { ...site, halls, counts: countsOf(halls.flatMap((hall) => hall.machines.map((one) => one.state))) }
  })
  let unplacedChanged = false
  const unplaced = list.unplaced.map((one): UnplacedMachine => {
    const state = stateOf(one.now, list.asOf)
    if (state === one.state) return one
    unplacedChanged = true
    return { ...one, state }
  })
  if (!sitesChanged && !unplacedChanged) return list
  const all = sites.flatMap((site) => site.halls.flatMap((hall) => hall.machines.map((one) => one.state)))
  return {
    ...list,
    sites: sitesChanged ? sites : list.sites,
    unplaced: unplacedChanged ? unplaced : list.unplaced,
    counts: sitesChanged ? countsOf(all) : list.counts,
    sending: sitesChanged ? sendingOf(all) : list.sending,
    needsYou: sitesChanged ? needsYouOf(all) : list.needsYou,
  }
}

/** The list with the item at `index` replaced; the others stay the same objects. */
function replaced<TItem>(items: ReadonlyArray<TItem>, index: number, item: TItem): Array<TItem> {
  return items.map((one, at) => (at === index ? item : one))
}

/** Where a machine stands on the sites: the site, the hall and the place in the hall, or nothing. */
function placeOf(list: SiteList, id: string): [number, number, number] | undefined {
  for (const [s, site] of list.sites.entries()) {
    for (const [h, hall] of site.halls.entries()) {
      const m = hall.machines.findIndex((one) => one.machine === id)
      if (m >= 0) return [s, h, m]
    }
  }
  return undefined
}

/**
 * What a message of the broker does to the sites. The id is looked up first; only the site, the
 * hall and the machine it names are copied.
 *
 * - A machine on a site keeps every message: one without values, which published nothing in the
 *   last 24 hours, keeps its identity, its alerts and its job orders too, and has no data until
 *   its first value; a value older than the backend looks for a machine leaves it without data.
 * - A machine on no site follows its messages as well.
 * - A machine the list does not hold joins "On no site" with its first value, if that is no older
 *   than the backend looks for a machine, as Home adds a machine (`listWith`).
 */
export function sitesWith(list: SiteList, topic: string, payload: string, now = Date.now()): SiteList {
  const id = machineOf(topic)
  if (id === undefined) return list
  const place = placeOf(list, id)
  if (place) {
    const [s, h, m] = place
    const site = list.sites[s]!
    const hall = site.halls[h]!
    const placed = hall.machines[m]!
    const before = placed.now ?? unknownMachine(id)
    const after = machineWith(before, topic, payload, now)
    if (after === before) return list
    const machines = replaced(hall.machines, m, { ...placed, now: after })
    const halls = replaced(site.halls, h, { ...hall, machines })
    return recounted({ ...list, sites: replaced(list.sites, s, { ...site, halls }) })
  }
  const u = list.unplaced.findIndex((one) => one.machine === id)
  if (u >= 0) {
    const one = list.unplaced[u]!
    const after = machineWith(one.now, topic, payload, now)
    if (after === one.now) return list
    return recounted({ ...list, unplaced: replaced(list.unplaced, u, { ...one, now: after }) })
  }
  const after = machineWith(unknownMachine(id), topic, payload, now)
  if (!sentLately(after, now)) return list
  const joined: UnplacedMachine = { machine: id, state: stateOf(after, list.asOf), now: after }
  const unplaced = [...list.unplaced, joined].sort((a, b) => a.machine.localeCompare(b.machine))
  return recounted({ ...list, unplaced })
}

/** The sites at a later instant: a machine that fell silent has no data, and its site counts it so. */
export function sitesAt(list: SiteList, now: string): SiteList {
  return now > list.asOf ? recounted({ ...list, asOf: now }) : list
}
