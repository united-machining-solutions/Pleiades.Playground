import type { SiteList } from "@pleiades/cards/site/contract.ts"

// The rules of placing a machine on a site from Home, as the Sites API keeps them
// (source/Pleiades.Playground.Sites.Api/Endpoints/SiteRules.cs): what a request may hold, the id of a
// new site, the halls of a site with one more, and the sentence a person reads when the API refuses.

/** The longest name, company, hall or display name a person may type. */
export const MAX_TEXT = 100

/** Where a machine stands, as Home read it: the site, the hall, and the name people know it by. */
export type Placement = { siteId: string; siteName: string; hall: string | null; displayName: string | null }

/**
 * A machine put on a site. The site is one that exists, or a new one with its name and company. The
 * hall is one of the site, a new one (`newHall`), or none. `move` for a machine that stands on a
 * site already; without it, a machine someone placed meanwhile is not moved.
 */
export type PlaceRequest = {
  machine: string
  site: { siteId: string } | { name: string; company: string }
  hall: string | null
  newHall: boolean
  displayName: string | null
  move: boolean
}

/** What became of placing: where the machine stands now, or why not and whether the list is out of date. */
export type PlaceOutcome = { ok: true; siteName: string; hall: string | null } | { ok: false; reason: string; stale: boolean }

/** What became of taking a machine off its site: done, also when it stood on none, or why not. */
export type RemoveOutcome = { ok: true; already: boolean } | { ok: false; reason: string }

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
  const hall = textOf(given.hall, "hall")
  return {
    machine: given.machine as string,
    site: chosen,
    hall,
    newHall: hall !== null && given.newHall === true,
    displayName: textOf(given.displayName, "display name"),
    move: given.move === true,
  }
}

/** Checks the machine id of a removal. */
export function machineIdOf(value: unknown): string {
  const problem = problemOfId(value, "machine id")
  if (problem) throw new Error(problem)
  return value as string
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

/** Where a machine stands in the list Home read, or undefined for a machine on no site. */
export function placementOf(list: SiteList, machine: string): Placement | undefined {
  for (const site of list.sites) {
    for (const hall of site.halls) {
      const placed = hall.machines.find((one) => one.machine === machine)
      if (placed) return { siteId: site.siteId, siteName: site.name, hall: hall.name, displayName: placed.displayName }
    }
  }
  return undefined
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
