import type { SiteList } from "@pleiades/cards/site/contract.ts"

// The rules of placing a machine on a site from Home, as the Sites API keeps them
// (source/Pleiades.Playground.Sites.Api/Endpoints/SiteRules.cs): what a request may hold, the id of a
// new site, the halls of a site with one more, and the sentence a person reads when the API refuses.

/** The longest name, company, hall or display name a person may type. */
export const MAX_TEXT = 100

/** Where a machine stands, as Home read it: the site, the hall, and the name people know it by. */
export type Placement = { siteId: string; siteName: string; hall: string | null; displayName: string | null }

/** Where a machine stands, by the ids of the Sites API: its site and hall. */
export type Spot = { siteId: string; hall: string | null }

/** Where a machine stands, with the name people know it by: what an undo puts back. */
export type Placed = Spot & { displayName: string | null }

/**
 * What a change made besides the placement: a new site, with the entity tag it was made with, or a new hall
 * of a site. An undo takes it away again, a site only while it is still the one that was made.
 */
export type Made = { siteId?: string | undefined; siteEtag?: string | undefined; hall?: Spot | undefined }

/**
 * A machine put on a site. The site is one that exists, or a new one with its name and company. The
 * hall is one of the site, a new one (`newHall`), or none. `from` is where the machine stands as
 * Home showed it, null for a machine on no site: where it stands elsewhere now, someone changed it
 * meanwhile, and nothing is written.
 */
export type PlaceRequest = {
  machine: string
  site: { siteId: string } | { name: string; company: string }
  hall: string | null
  newHall: boolean
  displayName: string | null
  from: Spot | null
}

/**
 * What became of placing: where the machine stands now, where it stood before as the Sites API had
 * it, and what was made for it; or why not, and whether the list is out of date.
 */
export type PlaceOutcome =
  | { ok: true; siteId: string; siteName: string; hall: string | null; before: Placed | null; made: Made }
  | { ok: false; reason: string; stale: boolean }

/** A machine taken off its site, from where Home showed it. */
export type RemoveRequest = { machine: string; from: Spot }

/**
 * What became of taking a machine off its site: done, with where it stood as the Sites API had it, or
 * nothing to do as it stood on no site; or why not, and whether the list is out of date.
 */
export type RemoveOutcome =
  | { ok: true; already: false; before: Placed; siteName: string }
  | { ok: true; already: true }
  | { ok: false; reason: string; stale: boolean }

/**
 * An undo: the machine stands at `now` after the change (null: on no site) and goes `back` where it
 * stood (null: on no site), and what the change `made` is taken away while nothing stands on it.
 */
export type UndoRequest = { machine: string; now: Spot | null; back: Placed | null; made: Made }

/** What became of an undo: done, or why not. */
export type UndoOutcome = { ok: true } | { ok: false; reason: string }

/**
 * A machine id or site id names one level of an MQTT topic: not blank, no `/`, `+`, `#` or `%`, no
 * blank at either end. The sentence of the problem, or undefined.
 */
export function problemOfId(value: unknown, name: string): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return `The ${name} is required.`
  if (/[/+#%]/.test(value)) return `The ${name} '${value}' contains '/', '+', '#' or '%'.`
  if (value !== value.trim()) return `The ${name} '${value}' begins or ends with a blank.`
  return undefined
}

/**
 * The name of a hall that is there already, as the Sites API keeps it, a blank at either end too: at
 * most MAX_TEXT long, not blank; none is null.
 */
function hallOf(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") throw new Error("The hall is text.")
  if (value.trim() === "") throw new Error("The hall, when given, has a name.")
  if (value.length > MAX_TEXT) throw new Error(`The hall is longer than ${MAX_TEXT} characters.`)
  return value
}

/** Where a machine stands as Home showed it: a site id and a hall of it, or null for no site. */
function spotOf(value: unknown): Spot | null {
  if (value === null || value === undefined) return null
  const given = value as Record<string, unknown>
  const problem = problemOfId(given.siteId, "site id")
  if (problem) throw new Error(problem)
  return { siteId: given.siteId as string, hall: hallOf(given.hall) }
}

/** A text a person typed: trimmed, at most MAX_TEXT long; blank is none. */
function textOf(value: unknown, name: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") throw new Error(`The ${name} is text.`)
  const text = value.trim()
  if (text.length > MAX_TEXT) throw new Error(`The ${name} is longer than ${MAX_TEXT} characters.`)
  return text === "" ? null : text
}

function required(value: unknown, name: string): string {
  const text = textOf(value, name)
  if (text === null) throw new Error(`The ${name} is required.`)
  return text
}

/** Checks what the dialog sends, before anything goes to the Sites API. Throws the sentence of the problem. */
export function placeRequestOf(value: unknown): PlaceRequest {
  const given = (value ?? {}) as Record<string, unknown>
  const idProblem = problemOfId(given.machine, "machine id")
  if (idProblem) throw new Error(idProblem)
  const site = (given.site ?? {}) as Record<string, unknown>
  let chosen: PlaceRequest["site"]
  if ("siteId" in site) {
    const siteProblem = problemOfId(site.siteId, "site id")
    if (siteProblem) throw new Error(siteProblem)
    chosen = { siteId: site.siteId as string }
  } else {
    chosen = { name: required(site.name, "name of the site"), company: required(site.company, "company") }
  }
  // A new hall is a name a person typed; a hall that is there is taken as the Sites API keeps it.
  const newHall = given.newHall === true || !("siteId" in chosen)
  const hall = newHall ? textOf(given.hall, "hall") : hallOf(given.hall)
  return {
    machine: given.machine as string,
    site: chosen,
    hall,
    newHall: hall !== null && newHall,
    displayName: textOf(given.displayName, "display name"),
    from: spotOf(given.from),
  }
}

/** Checks a removal: the machine id, and where Home showed the machine. */
export function removeRequestOf(value: unknown): RemoveRequest {
  const given = (value ?? {}) as Record<string, unknown>
  const problem = problemOfId(given.machine, "machine id")
  if (problem) throw new Error(problem)
  const from = spotOf(given.from)
  if (from === null) throw new Error("A removal names where the machine stands.")
  return { machine: given.machine as string, from }
}

/** Checks an undo: the machine id, where it stands now and where it goes back, and what was made. */
export function undoRequestOf(value: unknown): UndoRequest {
  const given = (value ?? {}) as Record<string, unknown>
  const problem = problemOfId(given.machine, "machine id")
  if (problem) throw new Error(problem)
  const back = spotOf(given.back)
  const made = (given.made ?? {}) as Record<string, unknown>
  const madeProblem = made.siteId === undefined ? undefined : problemOfId(made.siteId, "site id")
  if (madeProblem) throw new Error(madeProblem)
  const siteEtag = made.siteEtag
  if (siteEtag !== undefined && (typeof siteEtag !== "string" || siteEtag.length > MAX_TEXT)) throw new Error("The entity tag of a site is short text.")
  return {
    machine: given.machine as string,
    now: spotOf(given.now),
    back: back && { ...back, displayName: textOf((given.back as Record<string, unknown>).displayName, "display name") },
    made: { siteId: made.siteId as string | undefined, siteEtag, hall: spotOf(made.hall) ?? undefined },
  }
}

/** Whether a machine stands where Home showed it: on the same site, in the same hall. */
export function sameSpot(a: Spot | null, b: Spot | null): boolean {
  return a === null || b === null ? a === b : a.siteId === b.siteId && a.hall === b.hall
}

/**
 * The id of a new site, from its name: "North plant" is `north-plant`. An id that is taken gets a
 * number, `north-plant-2`, so a new site never overwrites one that exists.
 */
export function siteIdOf(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "site"
  if (!taken.has(base)) return base
  let number = 2
  while (taken.has(`${base}-${number}`)) number += 1
  return `${base}-${number}`
}

/** The halls of a site with one more at the end; a hall it has already is not named twice. */
export function hallsWith(halls: ReadonlyArray<string>, hall: string): Array<string> {
  return halls.includes(hall) ? [...halls] : [...halls, hall]
}

/** The text of an answer of the API: a sentence in JSON quotes, as ASP.NET Core writes a string, or as it came. */
export function sentenceOf(body: string): string {
  const text = body.trim()
  if (text.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (typeof parsed === "string") return parsed
    } catch {
      // Not JSON after all: the text as it came.
    }
  }
  return text
}

/** Why the Sites API did not take a change, in a sentence a person reads. */
export function refusalOf(status: number, body: string): string {
  if (status === 401 || status === 403) return "The Sites API refused the change: writing needs the role sites:write."
  const sentence = sentenceOf(body)
  if ((status === 400 || status === 409) && sentence !== "") return sentence
  return `The Sites API answered ${status}.`
}

/** Where each machine on a site stands in the list Home read, by machine id: one pass over the list. */
export function placementsOf(list: SiteList): Map<string, Placement> {
  const placements = new Map<string, Placement>()
  for (const site of list.sites) {
    for (const hall of site.halls) {
      for (const placed of hall.machines) {
        placements.set(placed.machine, { siteId: site.siteId, siteName: site.name, hall: hall.name, displayName: placed.displayName })
      }
    }
  }
  return placements
}

/** Where a machine stands in the list Home read, or undefined for a machine on no site. */
export function placementOf(list: SiteList, machine: string): Placement | undefined {
  return placementsOf(list).get(machine)
}

/** A place in words: "North plant, Hall 2", or the site alone. */
export function placeInWords(siteName: string, hall: string | null): string {
  return hall === null ? siteName : `${siteName}, ${hall}`
}

/** The company a new site starts with: the one every site has, or none. */
export function companyOf(list: SiteList): string {
  const companies = new Set(list.sites.map((site) => site.company))
  return companies.size === 1 ? [...companies][0]! : ""
}

/** A site as a person chooses it: its id and its name. */
export type SiteOption = { siteId: string; name: string }

/** The sites there are, by name, or why they could not be read. */
export type SitesOutcome = { ok: true; sites: Array<SiteOption> } | { ok: false; reason: string }

/**
 * Where a machine that was just added goes: on no site where there is none, on the only one, or on the one a
 * person chooses among several.
 */
export type SiteStep = { kind: "none" } | { kind: "one"; site: SiteOption } | { kind: "choose"; sites: Array<SiteOption> }

/** The step for the sites there are. */
export function siteStepOf(sites: ReadonlyArray<SiteOption>): SiteStep {
  if (sites.length === 0) return { kind: "none" }
  if (sites.length === 1) return { kind: "one", site: sites[0]! }
  return { kind: "choose", sites: [...sites] }
}

/** A machine that was just added, put on a site: in no hall, under no display name. */
export type AddedRequest = { machine: string; siteId: string }

/**
 * What became of putting an added machine on a site: on the site, or on the one it stood on already; or why
 * not.
 */
export type AddedOutcome = { ok: true; siteId: string; siteName: string; already: boolean } | { ok: false; reason: string }

/** Checks the machine id and the site id of an added machine. Throws the sentence of the problem. */
export function addedRequestOf(value: unknown): AddedRequest {
  const given = (value ?? {}) as Record<string, unknown>
  const problem = problemOfId(given.machine, "machine id") ?? problemOfId(given.siteId, "site id")
  if (problem) throw new Error(problem)
  return { machine: given.machine as string, siteId: given.siteId as string }
}
