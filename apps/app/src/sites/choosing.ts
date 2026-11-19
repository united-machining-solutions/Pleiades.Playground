import type { State } from "@pleiades/cards/machine/contract.ts"
import { labelOf } from "@pleiades/cards/machine/in-words.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { sliceOf } from "@pleiades/cards/shared/paging.ts"
import type { Slice } from "@pleiades/cards/shared/paging.ts"
import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { modelOf, titleOfPlaced } from "@pleiades/cards/site/in-words.ts"

import { identityOfId } from "./machine-id.ts"
import type { Identity, Maker } from "./machine-id.ts"
import { placedInWords } from "./placements.ts"
import { placeInWords, problemOfId } from "./placing.ts"
import type { PlaceRequest } from "./placing.ts"
import { namesInWords } from "./unplaced.ts"

// What the forms of "Add a new machine" and "Assign machines to a site" offer, in words over the list Home read; nothing here asks the backend,
// and nothing needs React, so a tool on the server can use it too. The machines, by what tells them apart:
// what it is, its manufacturer, what it does now and when it last sent a value; one that stands on a site
// is moved from there. A person finds one by any of these; a typed id that matches none gets the machines
// it is close to, so a typing error does not become a machine that never sends. And the sites and halls
// they go to, one of the list or one a person typed, made when the machines are placed or alone.

/** Where a machine stands now, for one that is moved where machines are added. */
export type StandsOn = { siteId: string; siteName: string; hall: string | null }

/**
 * A machine to add: one that sent data in the last 24 hours, or one a person named by its id (`byId`).
 * One that stands on a site already (`standsOn`) is moved from there.
 */
export type Candidate = {
  machine: string
  what: string
  manufacturer: string
  state: State
  lastValueAt: string | null
  byId: boolean
  standsOn: StandsOn | null
}

/** The machines that sent data and stand on no site, in the order of the backend. */
export function candidatesOf(list: Pick<SiteList, "unplaced">): Array<Candidate> {
  return list.unplaced.map((one) => ({
    machine: one.machine,
    what: modelOf(one),
    manufacturer: one.now.identity.manufacturer ?? manufacturerOfId(one.machine),
    state: one.state,
    lastValueAt: one.now.lastValueAt,
    byId: false,
    standsOn: null,
  }))
}

/** The machines that stand on a site, by machine id, each with where it stands: one to move where machines are added. */
export function placedCandidatesOf(list: Pick<SiteList, "sites">): Map<string, Candidate> {
  const placed = new Map<string, Candidate>()
  for (const site of list.sites) {
    for (const hall of site.halls) {
      for (const one of hall.machines) {
        placed.set(one.machine, {
          machine: one.machine,
          what: titleOfPlaced(one),
          manufacturer: one.now?.identity.manufacturer ?? manufacturerOfId(one.machine),
          state: one.state,
          lastValueAt: one.now?.lastValueAt ?? null,
          byId: false,
          standsOn: { siteId: site.siteId, siteName: site.name, hall: hall.name },
        })
      }
    }
  }
  return placed
}

/** A machine a person named by its id, which sent nothing in the last 24 hours. */
export function candidateById(machine: string): Candidate {
  return { machine, what: labelOf(machine), manufacturer: manufacturerOfId(machine), state: "no-data", lastValueAt: null, byId: true, standsOn: null }
}

/** The first part of a machine id of the binding, `<manufacturer>_<model>_<serial number>`, or nothing. */
function manufacturerOfId(machine: string): string {
  const parts = machine.split("_")
  return parts.length === 3 ? parts[0]! : ""
}

/**
 * Whether a text has the shape of a machine id of the binding: three parts joined by `_`, none of them
 * empty, and nothing a topic level may not hold. A word like "laser" is a search, not an id.
 */
export function isMachineId(text: string): boolean {
  const parts = text.split("_")
  return parts.length === 3 && parts.every((part) => part !== "" && !/\s/.test(part)) && problemOfId(text, "machine id") === undefined
}

/** The texts a search looks in: what the machine is, its manufacturer, its state and its id, and what the row says besides. */
export function fieldsOf(candidate: Candidate, ...shown: ReadonlyArray<string>): Array<string> {
  return [candidate.what, candidate.manufacturer, stateLabel[candidate.state], candidate.machine, ...shown]
}

/** Whether every word of the query stands in one of the fields, without regard to case. An empty query matches. */
export function matches(fields: ReadonlyArray<string>, query: string): boolean {
  const text = fields.join(" ").toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word))
}

/** How many single letters must change to turn one text into the other. */
export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j]!
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return row[b.length]!
}

/** Lower case, without blanks, `_` and `-`: "Laser2D L-1" and "laser2d_l1" are written alike. */
const plain = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, "")

/** How many letters a typing error changes: one, two in a text of twelve letters or more. */
const typosIn = (text: string) => (text.length >= 12 ? 2 : 1)

/** The shortest text a typing error is looked for in: below it, one letter in common is no nearness. */
const SHORTEST = 4

/**
 * How far a text lies from another as a typing error: the letters that change, where that is a typing
 * error and no more; undefined where the two are written otherwise.
 */
function typoDistance(typed: string, known: string): number | undefined {
  const a = plain(typed)
  const b = plain(known)
  if (a.length < SHORTEST || b.length < SHORTEST) return a === b && a !== "" ? 0 : undefined
  const distance = editDistance(a, b)
  return distance <= typosIn(b) ? distance : undefined
}

/** Whether a typed manufacturer is the one of an id: the same, short for it ("taygeta" for "taygeta-precision"), or one typing error off. */
function sameManufacturer(typed: string, known: string): boolean {
  const a = plain(typed)
  const b = plain(known)
  return a === b || known.toLowerCase().startsWith(`${typed.toLowerCase()}-`) || (a.length >= SHORTEST && editDistance(a, b) <= 1)
}

/**
 * How far a typed machine id lies from the id of a machine: the manufacturer the same, and model and serial
 * number together one typing error off at most; undefined where they differ more.
 */
function idDistance(typed: string, machine: string): number | undefined {
  const [maker, model, serial] = typed.split("_")
  const known = machine.split("_")
  if (known.length !== 3 || maker === undefined || model === undefined || serial === undefined) return undefined
  if (!sameManufacturer(maker, known[0]!)) return undefined
  const distance = editDistance(plain(model), plain(known[1]!)) + editDistance(plain(serial), plain(known[2]!))
  return distance <= 1 ? distance : undefined
}

/** At most this many machines are offered as what a person meant. */
export const MEANT_AT_MOST = 3

/**
 * The machines a query that matched none may have meant, where it is near one and nothing less: a typed
 * machine id of the same manufacturer, with model and serial number one typing error off; or a name
 * written as what the machine is, with or without its manufacturer, or as its id, one typing error off.
 * "Laser 2D L1" means Laser2D L-01; "MFP 7" means none of the machines of the demo. The nearest come first;
 * of two as near, the one the list names first.
 */
export function meantBy(query: string, candidates: ReadonlyArray<Candidate>): Array<Candidate> {
  const typed = query.trim()
  if (typed === "") return []
  const asId = isMachineId(typed)
  return candidates
    .map((candidate, order) => {
      const distances = asId
        ? [idDistance(typed, candidate.machine)]
        : [candidate.what, `${candidate.manufacturer} ${candidate.what}`, candidate.machine].map((known) => typoDistance(typed, known))
      const near = distances.filter((one): one is number => one !== undefined)
      return { candidate, order, distance: near.length > 0 ? Math.min(...near) : undefined }
    })
    .filter((one): one is { candidate: Candidate; order: number; distance: number } => one.distance !== undefined)
    .sort((a, b) => a.distance - b.distance || a.order - b.order)
    .slice(0, MEANT_AT_MOST)
    .map((one) => one.candidate)
}

const machinesInWords = (count: number) => (count === 1 ? "1 machine" : `${count} machines`)

/**
 * The button of the form: how many machines go where, and how many of them are moved from another place.
 * "Add 2 machines to North plant · Hall 1", "Add 3 and move 1 to North plant", "Move 1 machine to South plant";
 * where the site is new (`newSite`), `where` is its hall or none.
 */
export function addInWords(count: number, where: string | null, moves = 0, newSite: string | null = null, verb: "Add" | "Assign" = "Add"): string {
  if (count === 0) return `${verb} machines`
  const to = where === null ? "" : ` to ${where}`
  const adds = count - moves
  const words = moves === 0 ? `${verb} ${machinesInWords(count)}${to}` : adds === 0 ? `Move ${machinesInWords(moves)}${to}` : `${verb} ${adds} and move ${moves}${to}`
  // A new site is made first: "Create West plant and add 2 machines to Hall 1".
  return newSite === null ? words : `Create ${newSite} and ${words.charAt(0).toLowerCase()}${words.slice(1)}`
}

/**
 * The button of the form that adds one machine: "Add MFP 7 to North plant · Hall 2", "Move Lathe 4 to South
 * plant", "Create West plant and add MFP 7 to Hall 1"; "Add machine" while it is not known which.
 */
export function addOneInWords(name: string, where: string | null, move: boolean, newSite: string | null = null): string {
  const what = name.trim() || "machine"
  const to = where === null ? "" : ` to ${where}`
  const words = `${move ? "Move" : "Add"} ${what}${to}`
  return newSite === null ? words : `Create ${newSite} and ${words.charAt(0).toLowerCase()}${words.slice(1)}`
}

/** Whether a machine to move stands at the place chosen already, so there is nothing to do for it. */
export function standsAt(candidate: Pick<Candidate, "standsOn">, site: SiteChoice | null, hall: HallChoice): boolean {
  return candidate.standsOn !== null && site !== null && site.siteId === candidate.standsOn.siteId && !hall.made && hall.name === candidate.standsOn.hall
}

/**
 * The toast after an add or a move: the machine and where it went, or how many were added and moved
 * where, and a few of them by name.
 */
export function addedInWords(
  added: ReadonlyArray<string>,
  moved: ReadonlyArray<string>,
  siteName: string,
  hall: string | null,
): { title: string; description: string | undefined } {
  const [only] = [...added, ...moved]
  if (added.length + moved.length === 1 && only !== undefined) {
    return { title: placedInWords(only, siteName, hall, moved.length === 1), description: undefined }
  }
  const counts = [
    added.length > 0 ? `${machinesInWords(added.length)} added` : "",
    moved.length > 0 ? `${added.length > 0 ? moved.length : machinesInWords(moved.length)} moved` : "",
  ]
  return { title: `${counts.filter(Boolean).join(", ")} · ${placeInWords(siteName, hall)}`, description: namesInWords([...added, ...moved]) }
}

/** A site and hall as the dialog names them: "North plant · Hall 1", or the site alone. */
export function whereInWords(site: string, hall: string | null): string {
  return hall === null ? site : `${site} · ${hall}`
}

/** A site to choose: one of the list, or one a person typed (`siteId` null), made when the machine is placed. */
export type SiteChoice = { siteId: string | null; name: string; halls: ReadonlyArray<string> }

/** A hall to choose: none, one of the site, or one a person typed (`made`), made when the machine is placed. */
export type HallChoice = { name: string | null; made: boolean }

export const NO_HALL: HallChoice = { name: null, made: false }

/** The sites of the list as choices. */
export function siteChoicesOf(list: Pick<SiteList, "sites">): Array<SiteChoice> {
  return list.sites.map((site) => ({
    siteId: site.siteId,
    name: site.name,
    halls: site.halls.flatMap((hall) => (hall.name === null ? [] : [hall.name])),
  }))
}

/** What the fields add to a request: the site, by id or as a new one with its company, and the hall. */
export function whereOf(site: SiteChoice, hall: HallChoice, company: string): Pick<PlaceRequest, "site" | "hall" | "newHall"> {
  return {
    site: site.siteId === null ? { name: site.name, company: company.trim() } : { siteId: site.siteId },
    hall: hall.name,
    newHall: hall.made,
  }
}

/**
 * What a form of "Add a new machine" or "Assign machines to a site" may start with, where a page or the chat hands it one: machines chosen by
 * id, a site by its id or by a name, a hall by its name, the company of a new site, a display name. A
 * site of a name the list does not have, and a hall the site does not have, are made when the machines are
 * placed.
 */
export type PlaceStart = {
  machines?: ReadonlyArray<string> | undefined
  /**
   * Machines named by a name only, each with the ids it may mean and what is known of it, its manufacturer,
   * model and serial number, as the data model names them; or a whole id (`machine`) where that is all there
   * is. `from` is the caller's and not shown.
   */
  named?:
    | ReadonlyArray<{
        name: string
        meant: ReadonlyArray<string>
        manufacturer?: string | undefined
        model?: string | undefined
        serialNumber?: string | undefined
        machine?: string | undefined
        from?: string | undefined
      }>
    | undefined
  /** null: no place yet, a person chooses one; left out: the place used last. */
  site?: { siteId: string } | { name: string } | null | undefined
  hall?: string | null | undefined
  company?: string | undefined
  displayName?: string | undefined
}

/** The site and hall a form starts with: those it was handed, else the place used last, else none; none where it was handed null. */
export function startPlaceOf(
  start: PlaceStart | undefined,
  sites: ReadonlyArray<SiteChoice>,
  last: { siteId: string; hall: string | null } | null,
): { site: SiteChoice | null; hall: HallChoice } {
  const handed = start?.site
  if (handed === null) return { site: null, hall: NO_HALL }
  let site: SiteChoice | null
  if (handed === undefined) site = sites.find((one) => one.siteId === last?.siteId) ?? null
  else if ("siteId" in handed) site = sites.find((one) => one.siteId === handed.siteId) ?? null
  else {
    const name = handed.name.trim()
    site = name === "" ? null : (sites.find((one) => one.name.toLowerCase() === name.toLowerCase()) ?? { siteId: null, name, halls: [] })
  }
  const hallName = (handed === undefined ? last?.hall : start?.hall)?.trim() || null
  if (site === null || hallName === null) return { site, hall: NO_HALL }
  const known = site.halls.find((one) => one.toLowerCase() === hallName.toLowerCase())
  // The place used last offers only a hall that is there; a hall handed in is made where it is not.
  if (known !== undefined) return { site, hall: { name: known, made: false } }
  return { site, hall: handed === undefined ? NO_HALL : { name: hallName, made: true } }
}

/**
 * The machines a form starts with chosen, by id: those of the list; one that stands on a site already, to
 * be moved; and an id the list does not have, as a machine named by its id. The machines not among
 * `candidates` come back in `more`, for the form to list them.
 */
export function startMachinesOf(
  start: PlaceStart | undefined,
  candidates: ReadonlyArray<Candidate>,
  placed: ReadonlyMap<string, Candidate>,
): { chosen: Set<string>; more: Array<Candidate> } {
  const ids = [...new Set((start?.machines ?? []).map((one) => one.trim()))].filter((one) => one !== "" && problemOfId(one, "machine id") === undefined)
  const more = ids.filter((one) => !candidates.some((candidate) => candidate.machine === one)).map((one) => placed.get(one) ?? candidateById(one))
  return { chosen: new Set(ids), more }
}

/** Where the add of a machine starts from, as the Sites API is to find it: the place of one that is moved, none for the others. */
export function fromOf(candidate: Pick<Candidate, "standsOn">): { siteId: string; hall: string | null } | null {
  return candidate.standsOn && { siteId: candidate.standsOn.siteId, hall: candidate.standsOn.hall }
}

/**
 * The button of the form where it makes a site or a hall alone: "Create site South plant with Hall 1",
 * "Add Hall 4 to North plant"; null where there is nothing to make, a site and hall that are there.
 */
export function makeInWords(site: SiteChoice | null, hall: HallChoice): string | null {
  if (site === null) return null
  if (site.siteId === null) return `Create site ${site.name}${hall.name === null ? "" : ` with ${hall.name}`}`
  return hall.made && hall.name !== null ? `Add ${hall.name} to ${site.name}` : null
}

/** The toast after a site or hall was made: "South plant created, with Hall 1", "Hall 4 added to North plant". */
export function madeInWords(siteName: string, hall: string | null, newSite: boolean): string {
  if (newSite) return `${siteName} created${hall === null ? "" : `, with ${hall}`}`
  return `${hall ?? "A hall"} added to ${siteName}`
}

/** How many machines one page of the list shows; more go on further pages. */
export const MACHINES_A_PAGE = 7

/** One page of the machines a search found. A page beyond the last shows the last. */
export function pickerPageOf<TCandidate>(found: ReadonlyArray<TCandidate>, page: number): Slice<TCandidate> {
  return sliceOf(found, MACHINES_A_PAGE, page)
}

/** Whether all, some or none of the machines a search found are chosen, on every page of them. */
export function choiceOfAll(found: ReadonlyArray<Pick<Candidate, "machine">>, chosen: ReadonlySet<string>): "all" | "some" | "none" {
  const count = found.filter((one) => chosen.has(one.machine)).length
  return count === 0 ? "none" : count === found.length ? "all" : "some"
}

/** The machines chosen after "Choose all": every machine the search found, on every page, chosen or none of them; the others stay. */
export function chosenWithAll(chosen: ReadonlySet<string>, found: ReadonlyArray<Pick<Candidate, "machine">>, on: boolean): Set<string> {
  const next = new Set(chosen)
  for (const one of found) {
    if (on) next.add(one.machine)
    else next.delete(one.machine)
  }
  return next
}

/**
 * What "Add a new machine" starts with from what it is handed: what is known of the first machine named, its
 * manufacturer, model and serial number, or its id split into them, and the name it is known by; or the first
 * machine handed in by its id, split.
 */
export function addStartOf(start: PlaceStart | undefined, makers: ReadonlyArray<Maker>): { identity: Identity; name: string } {
  const none = { manufacturer: "", model: "", serialNumber: "" }
  const named = start?.named?.find((one) => one.name.trim() !== "")
  if (named !== undefined) {
    const said = { manufacturer: named.manufacturer ?? "", model: named.model ?? "", serialNumber: named.serialNumber ?? "" }
    const heard = Object.values(said).some((part) => part.trim() !== "") ? said : (identityOfId(named.machine ?? "", makers) ?? none)
    return { identity: heard, name: named.name.trim() }
  }
  const machine = start?.machines?.map((one) => one.trim()).find((one) => one !== "")
  return { identity: (machine && identityOfId(machine, makers)) || none, name: "" }
}

/**
 * Whether the id of a new machine is one the list has: a machine that sends and stands on no site, one that
 * stands on a site, or none, a new machine. Only the id itself counts, written exactly as the binding writes it.
 */
export function knownMachineOf(
  machine: string | undefined,
  sending: ReadonlyArray<Candidate>,
  placed: ReadonlyMap<string, Candidate>,
): { kind: "sends"; candidate: Candidate } | { kind: "placed"; candidate: Candidate } | { kind: "new" } {
  if (machine === undefined) return { kind: "new" }
  const onSite = placed.get(machine)
  if (onSite) return { kind: "placed", candidate: onSite }
  const sends = sending.find((one) => one.machine === machine)
  return sends ? { kind: "sends", candidate: sends } : { kind: "new" }
}
