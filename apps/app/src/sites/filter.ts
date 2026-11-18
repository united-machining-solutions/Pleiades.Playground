import type { Machine, State } from "@pleiades/cards/machine/contract.ts"
import { NEEDS_YOU, stateLabel } from "@pleiades/cards/machine/state.ts"
import type { Hall, PlacedMachine, Site, SiteList, StateCount, UnplacedMachine } from "@pleiades/cards/site/contract.ts"
import { modelOf } from "@pleiades/cards/site/in-words.ts"
import { sliceOf } from "@pleiades/cards/shared/paging.ts"

import { unknownMachine } from "../live/machines.ts"
import { sentLately } from "../live/sites.ts"

// What Home shows of the sites the backend gave: every site with its halls, or only the
// machines that need someone, or those that answer a search, ten sites to a page. It chooses among
// the values and keeps their order; it adds up nothing.

/** `?show=needs` of the address: only the machines that need someone. Anything else shows all. */
export function showOf(raw: unknown): "needs" | undefined {
  return raw === "needs" ? "needs" : undefined
}

/** `?page=` of the address: a whole number from 2 on. Page 1 is the page without it. */
export function pageOfSearch(raw: unknown): number | undefined {
  const page = Number(raw)
  return Number.isInteger(page) && page > 1 ? page : undefined
}

/**
 * What a press on "All | Needs you" chooses. The toggle group gives an empty choice where a person
 * presses the chosen item again: that keeps what is shown (null).
 */
export function showOfToggle(chosen: ReadonlyArray<string>): "needs" | undefined | null {
  if (chosen.length === 0) return null
  return chosen[0] === "needs" ? "needs" : undefined
}

export function needsSomeone(state: State): boolean {
  return NEEDS_YOU.includes(state)
}

/**
 * Whether a machine answers what was typed. Case does not matter, and every word must be found in
 * what the page shows of it: its name, what it is, its machine id, its state, its work master, its
 * hall and its site. "hall" finds the machines in a hall, "lathe" the one called Lathe 4.
 */
export function matches(placed: PlacedMachine, hall: Hall, site: Site, query: string): boolean {
  return answers(query, [
    placed.displayName,
    modelOf(placed),
    placed.machine,
    stateLabel[placed.state],
    placed.now?.program.value,
    hall.name,
    site.name,
    site.company,
  ])
}

/** The same for a machine on no site: what it is, its id, its state and its work master. */
export function matchesUnplaced(one: UnplacedMachine, query: string): boolean {
  return answers(query, [modelOf(one), one.machine, stateLabel[one.state], one.now.program.value])
}

function answers(query: string, shown: ReadonlyArray<string | null | undefined>): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const text = shown.filter(Boolean).join(" ").toLowerCase()
  return words.every((word) => text.includes(word))
}

/**
 * A machine in the list: its values, its state, the name people entered for it, and what it is, by
 * its identification or by its machine id. `linked` where its page has something to show: a machine
 * that sent no value in the last 24 hours has none.
 */
export type Row = { machine: Machine; state: State; name: string | undefined; what: string; linked: boolean }

/**
 * A group of the list: a site with the halls that hold a machine shown, or the machines on no site
 * (`site` null). `counts` are those the backend gave for the site, over all its machines.
 */
export type Group = {
  site: Site | null
  halls: Array<{ name: string; rows: Array<Row> }>
  /** The halls of the site without a machine, named in one line; none while a filter is chosen. */
  emptyHalls: Array<string>
  counts: ReadonlyArray<StateCount> | null
  machines: number
}

/**
 * The groups of the list, in the order of the backend, and the sites without a machine. A site is a
 * group while it holds a machine that is shown: with "needs", one that needs someone; with a search,
 * one that answers it. The machines on no site come last.
 */
export function groupsOf(list: SiteList, { needs, query }: { needs: boolean; query: string }): { groups: Array<Group>; emptySites: Array<Site> } {
  const filtered = needs || query.trim() !== ""
  const asOf = Date.parse(list.asOf)
  const shown = (state: State) => !needs || needsSomeone(state)
  const groups = list.sites.flatMap((site): Array<Group> => {
    const halls = site.halls.map((hall) => ({
      name: hall.name ?? "No hall",
      empty: hall.machines.length === 0,
      rows: hall.machines
        .filter((one) => shown(one.state) && matches(one, hall, site, query))
        .map(
          (one): Row => ({
            machine: one.now ?? unknownMachine(one.machine),
            state: one.state,
            name: one.displayName || undefined,
            what: modelOf(one),
            linked: sentLately(one.now, asOf),
          }),
        ),
    }))
    const machines = halls.reduce((count, hall) => count + hall.rows.length, 0)
    if (machines === 0) return []
    return [
      {
        site,
        halls: halls.filter((hall) => hall.rows.length > 0).map(({ name, rows }) => ({ name, rows })),
        emptyHalls: filtered ? [] : halls.filter((hall) => hall.empty).map((hall) => hall.name),
        counts: site.counts,
        machines,
      },
    ]
  })
  const unplaced = list.unplaced
    .filter((one) => shown(one.state) && matchesUnplaced(one, query))
    .map((one): Row => ({ machine: one.now, state: one.state, name: undefined, what: modelOf(one), linked: true }))
  const noSite: Array<Group> =
    unplaced.length > 0 ? [{ site: null, halls: [{ name: "", rows: unplaced }], emptyHalls: [], counts: null, machines: unplaced.length }] : []
  return { groups: [...groups, ...noSite], emptySites: filtered ? [] : list.sites.filter((site) => site.machineCount === 0) }
}

/** How many sites a page shows. A site stands whole on one page, the machines on no site count as one. */
export const SITES_PER_PAGE = 10

/** A page of the groups, and where it lies among all of them. */
export type SitesPage = { groups: Array<Group>; page: number; pages: number; sites: number }

/**
 * One page of the groups. A page asked for that does not exist is the nearest that does: below the
 * first the first, beyond the last the last. Up to ten groups make one page.
 */
export function pageOf(groups: ReadonlyArray<Group>, page: number | undefined): SitesPage {
  const { items, page: current, pages } = sliceOf(groups, SITES_PER_PAGE, page ?? 1)
  return { groups: items, page: current, pages, sites: groups.filter((group) => group.site !== null).length }
}

/**
 * Why the list is empty: no machine stands on a site or sent a value, none needs someone, or none
 * answers the search. Where a filter is chosen, the page offers to show every machine again.
 */
export function emptyOf({ needs, query }: { needs: boolean; query: string }): { title: string; description: string; clearable: boolean } {
  if (query.trim() !== "") return { title: "No machine matches", description: "No machine answers what is chosen.", clearable: true }
  if (needs) return { title: "Nobody is needed", description: "No machine is in alarm, stopped or without data.", clearable: true }
  return { title: "No machine yet", description: "No machine stands on a site, and none sent a value in the last 24 hours.", clearable: false }
}


/**
 * The address after a person changed what is shown: the change, and back to page 1, because the
 * page they were on counts other groups now.
 */
export function changed<TSearch extends { page?: number | undefined }>(previous: TSearch, change: Partial<TSearch>): TSearch {
  return { ...previous, ...change, page: undefined }
}
