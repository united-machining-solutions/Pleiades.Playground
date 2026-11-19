import type { PlacedMachine, SiteList } from "@pleiades/cards/site/contract.ts"
import { modelOf } from "@pleiades/cards/site/in-words.ts"
import { z } from "zod"

import { jsonOf } from "../chat/tool-results.ts"
import { candidatesOf, editDistance, isMachineId, meantBy, placedCandidatesOf, whereInWords } from "../sites/choosing.ts"
import { identityInWords, machineIdOf, makersOf } from "../sites/machine-id.ts"
import type { Identity } from "../sites/machine-id.ts"
import { MAX_TEXT, companyOf, problemOfId } from "../sites/placing.ts"

// Where machines go, as the chat proposes it (ADR-0026). The language model names machines, a site and a
// hall in the words of the person; the app checks them against the list of the sites, here, and the chat
// draws a card the person changes and confirms. Nothing here writes: only the button of the card does, with
// the same steps as "Add machine" on Home. The same check runs twice: when the model calls the tool, so it
// reads what needs a look, and when the card is drawn, against the list of that moment.

/** The tool of the app itself with which the language model proposes where machines go. */
export const PROPOSE_PLACEMENT_TOOL = "app_placement_propose"

/** The most machines one proposal names. */
export const MAX_MACHINES = 50

/**
 * A machine as the person describes it: its name, and what the person said of what makes its id (ADR-0015):
 * its manufacturer, model and serial number, each left out where the person did not say it.
 */
export const describedMachineSchema = z.object({
  name: z.string().max(MAX_TEXT).optional(),
  manufacturer: z.string().max(MAX_TEXT).optional(),
  model: z.string().max(MAX_TEXT).optional(),
  serialNumber: z.string().max(MAX_TEXT).optional(),
})
export type DescribedMachine = z.infer<typeof describedMachineSchema>



/** What the language model sends, as the schema of the tool takes it. */
export const placementInputSchema = z.object({
  machines: z.array(z.union([z.string().max(200), describedMachineSchema])).max(MAX_MACHINES).default([]),
  site: z.string().max(MAX_TEXT).optional(),
  hall: z.string().max(MAX_TEXT).optional(),
  displayName: z.string().max(MAX_TEXT).optional(),
  company: z.string().max(MAX_TEXT).optional(),
})
export type PlacementInput = z.input<typeof placementInputSchema>

/** A machine of the proposal, as the list of the sites has it now. */
export type MachineFinding =
  /** Sent data in the last 24 hours and stands on no site: it is added. */
  | { said: string; machine: string; status: "add"; what: string }
  /** Stands on another site or in another hall: it moves. `from` in words. */
  | { said: string; machine: string; status: "move"; what: string; from: string; fromSpot: { siteId: string; hall: string | null } }
  /** Stands where the proposal puts it already. */
  | { said: string; machine: string; status: "already"; what: string }
  /**
   * No machine of that id sent data in the last 24 hours, and none stands on a site: it is added without data
   * and shows "No data" until it sends. `meant` are machines that did send with a similar id, a typing error maybe.
   */
  | { said: string; machine: string; status: "unknown"; meant: Array<{ machine: string; what: string }> }
  /**
   * A machine the person knows that no machine of the list is, such as "MFP 20": one that sent no data yet. The
   * card asks which machine it is: one of `meant`, machines with a similar name, or one of the manufacturer,
   * model and serial number in `identity`, as far as the person said them. Where all three are said, `machine`
   * is the id made of them (ADR-0015).
   */
  | { said: string; status: "named"; name: string; meant: Array<{ machine: string; what: string }>; identity: Identity; machine?: string }
  /** A short name that fits more than one machine. */
  | { said: string; status: "ambiguous"; fits: Array<{ machine: string; what: string }> }
  /** No machine id at all. */
  | { said: string; status: "invalid"; problem: string }

/** The site of the proposal: one of the list, the one of the list with the closest name, or a new one. */
export type SiteFinding =
  | { kind: "existing"; siteId: string; name: string }
  | { kind: "guess"; siteId: string; name: string; said: string }
  | { kind: "new"; name: string; company: string }

/** The hall of the proposal: one of the site, the one with the closest name, or a new one. */
export type HallFinding = { kind: "existing"; name: string } | { kind: "guess"; name: string; said: string } | { kind: "new"; name: string }

/** The proposal as the app checked it against one list of the sites. */
export type PlacementCheck = {
  machines: Array<MachineFinding>
  /** The site, or null where the proposal names none: then the person chooses it in the card. */
  site: SiteFinding | null
  hall: HallFinding | null
  /** The names of the sites there are, for the words that ask where the machines go. */
  sites: Array<string>
  /** The display name, kept only where exactly one machine is added or moved. */
  displayName: string | null
  /** Whether the model gave a display name that was left out. */
  displayNameLeftOut: boolean
}

/** A text as names are compared: lower case, blanks folded. */
function plain(text: string): string {
  return text.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * Whether `said` is a typing error of `name`: the same words, each written nearly alike, a number exactly,
 * and two edits at most in all; or, where the words do not pair, one edit in all. "Nort plant" is North
 * plant; "South plant" is not, and "Hall 4" is not Hall 1.
 */
export function mistypedAs(said: string, name: string): boolean {
  const a = plain(said)
  const b = plain(name)
  if (a === b || a === "" || b === "") return false
  const wordsA = a.split(" ")
  const wordsB = b.split(" ")
  if (wordsA.length !== wordsB.length) return editDistance(a, b) <= 1
  let total = 0
  for (const [index, word] of wordsA.entries()) {
    const other = wordsB[index]!
    if (word === other) continue
    if (/\d/.test(word) || /\d/.test(other)) return false
    const distance = editDistance(word, other)
    if (distance > Math.max(1, Math.floor(Math.max(word.length, other.length) / 4))) return false
    total += distance
  }
  return total <= 2
}

/** The one name of `names` that `said` is a typing error of, the closest first; none where none is. */
export function closestName(said: string, names: ReadonlyArray<string>): string | undefined {
  return names
    .filter((name) => mistypedAs(said, name))
    .sort((x, y) => editDistance(plain(said), plain(x)) - editDistance(plain(said), plain(y)))[0]
}

/** A machine on a site, with where it stands. */
type Standing = { placed: PlacedMachine; siteId: string; siteName: string; hall: string | null }

function standingOf(list: SiteList): Map<string, Standing> {
  const standing = new Map<string, Standing>()
  for (const site of list.sites) {
    for (const hall of site.halls) {
      for (const placed of hall.machines) standing.set(placed.machine, { placed, siteId: site.siteId, siteName: site.name, hall: hall.name })
    }
  }
  return standing
}

/** The site the proposal names, by its id, by its name, by the closest name, or a new one. */
function siteOf(said: string, list: SiteList, company: string | undefined): SiteFinding {
  const byId = list.sites.find((site) => site.siteId === said)
  if (byId) return { kind: "existing", siteId: byId.siteId, name: byId.name }
  const byName = list.sites.find((site) => plain(site.name) === plain(said))
  if (byName) return { kind: "existing", siteId: byName.siteId, name: byName.name }
  const closest = closestName(
    said,
    list.sites.map((site) => site.name),
  )
  const guess = list.sites.find((site) => site.name === closest)
  if (guess) return { kind: "guess", siteId: guess.siteId, name: guess.name, said }
  return { kind: "new", name: said, company: company?.trim() || companyOf(list) }
}

/** The hall the proposal names in its site, or a new one; none where it names none. */
function hallOf(said: string | undefined, site: SiteFinding, list: SiteList): HallFinding | null {
  const name = said?.trim() ?? ""
  if (name === "") return null
  if (site.kind === "new") return { kind: "new", name }
  const halls = (list.sites.find((one) => one.siteId === site.siteId)?.halls ?? []).flatMap((hall) => (hall.name === null ? [] : [hall.name]))
  const same = halls.find((hall) => plain(hall) === plain(name))
  if (same !== undefined) return { kind: "existing", name: same }
  const closest = closestName(name, halls)
  return closest === undefined ? { kind: "new", name } : { kind: "guess", name: closest, said: name }
}

/**
 * The machine a short name such as "P-07", "TP-800 P-07" or a display name such as "Lathe 4" stands for: those
 * whose id ends in it or whose name it is, each machine once.
 */
export function fitsOf(said: string, known: ReadonlyArray<{ machine: string; what: string }>): Array<{ machine: string; what: string }> {
  const text = plain(said)
  const fits = known.filter((one) => plain(one.machine).endsWith(`_${text}`) || plain(one.what) === text || plain(one.what).endsWith(` ${text}`))
  return fits.filter((one, index) => fits.findIndex((other) => other.machine === one.machine) === index)
}

/**
 * Checks a proposal against the list of the sites: each machine, the site and the hall. A machine is named
 * by its id, or by a short name that fits one machine only; one named twice counts once. The display name
 * stays only where exactly one machine is added or moved.
 */
export function checkPlacement(raw: PlacementInput, list: SiteList): PlacementCheck {
  const input = placementInputSchema.parse(raw)
  const said = input.site?.trim() ?? ""
  const site = said === "" ? null : siteOf(said, list, input.company)
  const hall = site === null ? null : hallOf(input.hall, site, list)
  const target = site === null ? null : { siteId: site.kind === "new" ? null : site.siteId, hall: hall?.name ?? null }
  const standing = standingOf(list)
  const sending = candidatesOf(list)
  const known = [
    ...sending.map(({ machine, what }) => ({ machine, what })),
    ...[...standing.values()].map(({ placed }) => ({ machine: placed.machine, what: modelOf(placed) })),
    // A machine on a site is known by its display name too.
    ...[...standing.values()].flatMap(({ placed }) => (placed.displayName ? [{ machine: placed.machine, what: placed.displayName }] : [])),
  ]
  const makers = makersOf(list)
  // The machines a name may mean: those that sent data, and those on a site.
  const alike = [...sending, ...placedCandidatesOf(list).values()]
  const meantOf = (name: string) =>
    name === "" ? [] : meantBy(name, alike.filter((one) => !seen.has(one.machine))).map(({ machine: id, what }) => ({ machine: id, what }))
  const seen = new Set<string>()
  const machines: Array<MachineFinding> = []
  for (const entry of input.machines) {
    let said: string
    let machine: string
    if (typeof entry === "string") {
      said = entry.trim()
      machine = said
    } else {
      // A machine the person described: where all three parts are said, its id is made of them, and it may
      // be one that sends already; else the card asks for the rest. Never another machine in its place.
      const identity = { manufacturer: entry.manufacturer?.trim() ?? "", model: entry.model?.trim() ?? "", serialNumber: entry.serialNumber?.trim() ?? "" }
      const id = machineIdOf(identity, makers)
      said = entry.name?.trim() || identityInWords(identity)
      if (said === "") continue
      if (id === undefined || !known.some((one) => one.machine === id)) {
        if (id !== undefined && seen.has(id)) continue
        if (id !== undefined) seen.add(id)
        // A name split by the model ("Laser" as manufacturer, "2D L1" as name) is looked for whole, too.
        const whole = [identity.manufacturer, identity.model, entry.name?.trim() ?? "", identity.serialNumber].filter(Boolean).join(" ")
        const meant = id !== undefined ? [] : meantOf(entry.name?.trim() ?? "").length > 0 ? meantOf(entry.name?.trim() ?? "") : meantOf(whole)
        machines.push({ said, status: "named", name: said, meant, identity, ...(id && { machine: id }) })
        continue
      }
      machine = id
    }
    if (said === "") continue
    if (typeof entry === "string" && !isMachineId(said)) {
      const fits = fitsOf(said, known)
      if (fits.length > 1) {
        machines.push({ said, status: "ambiguous", fits })
        continue
      }
      if (fits.length === 1) machine = fits[0]!.machine
      else if (problemOfId(said, "machine id") === undefined) {
        // A machine the person knows by a name only: never another machine in its place.
        machines.push({ said, status: "named", name: said, meant: meantOf(said), identity: { manufacturer: "", model: "", serialNumber: "" } })
        continue
      }
    }
    if (seen.has(machine)) continue
    seen.add(machine)
    const problem = problemOfId(machine, "machine id")
    if (problem) {
      machines.push({ said, status: "invalid", problem })
      continue
    }
    const stands = standing.get(machine)
    if (stands) {
      const what = modelOf(stands.placed)
      if (target !== null && stands.siteId === target.siteId && stands.hall === target.hall) machines.push({ said, machine, status: "already", what })
      else {
        const fromSpot = { siteId: stands.siteId, hall: stands.hall }
        machines.push({ said, machine, status: "move", what, from: whereInWords(stands.siteName, stands.hall), fromSpot })
      }
      continue
    }
    const sends = sending.find((one) => one.machine === machine)
    if (sends) {
      machines.push({ said, machine, status: "add", what: sends.what })
      continue
    }
    const meant = meantBy(machine, sending.filter((one) => !seen.has(one.machine))).map(({ machine: id, what }) => ({ machine: id, what }))
    machines.push({ said, machine, status: "unknown", meant })
  }
  const placing = machines.filter((one) => ["add", "move", "unknown", "named"].includes(one.status))
  // One machine known by a name only is shown by that name, unless the model gave another.
  const only = placing.length === 1 ? placing[0] : undefined
  const given = input.displayName?.trim() || null
  const displayName = given ?? (only?.status === "named" ? only.name : null)
  return {
    machines,
    site,
    hall,
    sites: list.sites.map((one) => one.name),
    displayName: only ? displayName : null,
    displayNameLeftOut: given !== null && only === undefined,
  }
}

/** How many machines are added and how many move. */
export function countsOf(check: PlacementCheck): { add: number; move: number } {
  return {
    add: check.machines.filter((one) => one.status === "add").length,
    move: check.machines.filter((one) => one.status === "move").length,
  }
}

/** Whether the proposal changes nothing: no machine to place, nothing to look at, and the site and hall there. */
export function changesNothing(check: PlacementCheck): boolean {
  const { add, move } = countsOf(check)
  const open = check.machines.some((one) => one.status === "unknown" || one.status === "named" || one.status === "ambiguous")
  return add + move === 0 && !open && check.site !== null && check.site.kind === "existing" && (check.hall === null || check.hall.kind === "existing")
}

const machinesInWords = (count: number) => (count === 1 ? "1 machine" : `${count} machines`)

/** The words the language model reads and passes on: what the card proposes, and what needs a look. */
export function placementInWords(check: PlacementCheck): string {
  const { add, move } = countsOf(check)
  const sentences: Array<string> = []
  const site = check.site
  const where = site === null ? "" : whereInWords(site.name, check.hall?.name ?? null)
  if (site === null) {
    const names = check.machines.map((one) => ("what" in one ? one.what : one.said)).join(", ")
    const sites = check.sites.length > 0 ? ` The sites are ${check.sites.join(", ")}.` : ""
    sentences.push(`The card shows ${names || "the proposal"} with no place chosen: the card asks the person where it goes.${sites}`)
  } else if (add + move > 0) {
    const what = move === 0 ? `add ${machinesInWords(add)}` : add === 0 ? `move ${machinesInWords(move)}` : `add ${add} and move ${move} ${move === 1 ? "machine" : "machines"}`
    sentences.push(`The card proposes to ${what} to ${where}.`)
  } else if (check.machines.length === 0 && site.kind === "new") {
    sentences.push(`The card proposes to create the site ${site.name}${check.hall ? ` with the hall ${check.hall.name}` : ""}.`)
  } else if (check.machines.length === 0 && check.hall?.kind === "new") {
    sentences.push(`The card proposes to add the hall ${check.hall.name} to ${site.name}.`)
  } else if (!changesNothing(check)) {
    sentences.push(`The card proposes ${where}.`)
  }
  if (site?.kind === "new" && check.machines.length > 0) sentences.push(`${site.name} is a new site.`)
  if (site?.kind === "guess") {
    sentences.push(`There is no site '${site.said}'. The card chose ${site.name}, the closest name, and offers to create '${site.said}' instead.`)
  }
  if (site !== null && site.kind !== "new" && check.hall?.kind === "new" && check.machines.length > 0) {
    sentences.push(`${check.hall.name} is a new hall of ${site.name}.`)
  }
  if (site !== null && check.hall?.kind === "guess") sentences.push(`${site.name} has no hall '${check.hall.said}'. The card chose ${check.hall.name}, the closest name.`)
  for (const one of check.machines) {
    if (one.status === "move") sentences.push(`${one.what} stands on ${one.from} now and would move.`)
    if (one.status === "already") sentences.push(`${one.what} stands there already.`)
    if (one.status === "invalid") sentences.push(`'${one.said}' is no machine id: ${one.problem}`)
    if (one.status === "ambiguous") sentences.push(`'${one.said}' fits ${one.fits.map((fit) => fit.machine).join(", ")}: the card asks which one.`)
    if (one.status === "unknown") {
      const meant = one.meant.length > 0 ? ` A machine with a similar id did: ${one.meant.map((fit) => fit.machine).join(" or ")}. The card offers it, if that was meant.` : ""
      sentences.push(`${one.machine} sent no data in the last 24 hours. The card adds it without data, and it shows "No data" until it sends.${meant}`)
    }
    if (one.status === "named" && one.machine !== undefined) sentences.push(`${one.name} sent no data yet; the card adds it as ${one.machine}.`)
    if (one.status === "named" && one.machine === undefined) sentences.push(`No machine ${one.name} sent data; the card asks the person which machine it is.`)
  }
  if (check.displayNameLeftOut) sentences.push("The display name is left out: it is for one machine only.")
  sentences.push("Nothing is written until the person confirms in the card.")
  return sentences.join(" ")
}

/** What the tool gives back: what the model sent, as the card checks it again, and the check of that moment. */
export type PlacementResult = { input: PlacementInput; check: PlacementCheck; summary: string }

/** What the model sent, in a result of the tool as the chat gets it: JSON as text. Null for anything else. */
export function proposedPlacement(content: unknown): PlacementInput | null {
  const value = jsonOf(content)
  if (typeof value !== "object" || value === null || !("input" in value)) return null
  const input = placementInputSchema.safeParse(value.input)
  return input.success ? input.data : null
}

/** The display name a machine has on its site now, as the list of the sites has it; null on no site or without one. */
export function displayNameOf(list: SiteList, machine: string): string | null {
  for (const site of list.sites) {
    for (const hall of site.halls) {
      const placed = hall.machines.find((one) => one.machine === machine)
      if (placed) return placed.displayName
    }
  }
  return null
}

/**
 * The display name a placement writes: the one the proposal gives, else the one the machine has now, so a
 * machine that is moved keeps the name people know it by, as it does on Home.
 */
export function nameToWrite(given: string | null | undefined, list: SiteList, machine: string): string | null {
  return given?.trim() || displayNameOf(list, machine)
}
