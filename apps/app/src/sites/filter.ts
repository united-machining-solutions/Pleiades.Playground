import type { Machine, State } from "@pleiades/cards/machine/contract.ts"
import { labelOf } from "@pleiades/cards/machine/in-words.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import type { Hall, PlacedMachine, Site, SiteList, StateCount, UnplacedMachine } from "@pleiades/cards/site/contract.ts"
import { modelOf } from "@pleiades/cards/site/in-words.ts"

import { unknownMachine } from "../live/machines.ts"

// What the page Sites shows of the sites the backend gave: every site with its halls, or only the
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

/** The states that need someone, as Home has them under "Needs you". */
const NEEDS: ReadonlyArray<State> = ["alarm", "stopped", "no-data"]

export function needsSomeone(state: State): boolean {
  return NEEDS.includes(state)
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

/** A machine in the list: its values, its state, and the name people entered for it. */
export type Row = { machine: Machine; state: State; name: string | undefined }

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
 * The name of a machine of a site in its row: the name people entered for it; or, for a machine that
 * sent nothing and is known by its id only, its model and serial number from the id.
 */
function nameOf(placed: PlacedMachine): string | undefined {
  if (placed.displayName) return placed.displayName
  return placed.now === null ? labelOf(placed.machine) : undefined
}

/**
 * The groups of the list, in the order of the backend, and the sites without a machine. A site is a
 * group while it holds a machine that is shown: with "needs", one that needs someone; with a search,
 * one that answers it. The machines on no site come last.
 */
export function groupsOf(list: SiteList, { needs, query }: { needs: boolean; query: string }): { groups: Array<Group>; emptySites: Array<Site> } {
  const filtered = needs || query.trim() !== ""
  const shown = (state: State) => !needs || needsSomeone(state)
  const groups = list.sites.flatMap((site): Array<Group> => {
    const halls = site.halls.map((hall) => ({
      name: hall.name ?? "No hall",
      empty: hall.machines.length === 0,
      rows: hall.machines
        .filter((one) => shown(one.state) && matches(one, hall, site, query))
        .map((one): Row => ({ machine: one.now ?? unknownMachine(one.machine), state: one.state, name: nameOf(one) })),
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
    .map((one): Row => ({ machine: one.now, state: one.state, name: undefined }))
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
  const pages = Math.max(1, Math.ceil(groups.length / SITES_PER_PAGE))
  const current = Math.min(Math.max(1, page ?? 1), pages)
  const start = (current - 1) * SITES_PER_PAGE
  return {
    groups: groups.slice(start, start + SITES_PER_PAGE),
    page: current,
    pages,
    sites: groups.filter((group) => group.site !== null).length,
  }
}


/**
 * The address after a person changed what is shown: the change, and back to page 1, because the
 * page they were on counts other groups now.
 */
export function changed<TSearch extends { page?: number | undefined }>(previous: TSearch, change: Partial<TSearch>): TSearch {
  return { ...previous, ...change, page: undefined }
}
