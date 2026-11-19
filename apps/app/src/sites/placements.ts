import { reasonOf } from "../reason.ts"
import { hallsWith, placeInWords, refusalOf, sameSpot, siteIdOf } from "./placing.ts"
import type { Made, PlaceOutcome, PlaceRequest, Placed, RemoveOutcome, RemoveRequest, Spot, UndoOutcome, UndoRequest } from "./placing.ts"

// The steps of placing a machine, of taking it off its site and of undoing either, against the REST
// endpoints of the Sites API. They run on the server of the app (sites-api.ts), never in the browser and
// never as a tool of the language model. The API checks everything again; these steps keep a person from
// overwriting what someone else did meanwhile: each change names where the machine stands as Home showed
// it, and is refused where it stands elsewhere now.

/**
 * One request to the Sites API, with the conditions of a write on a site where it has them: its status and
 * its text. A network failure throws.
 */
export type Send = (
  path: string,
  method: "GET" | "PUT" | "DELETE",
  body?: unknown,
  conditions?: { ifMatch?: string; ifNoneMatch?: string },
) => Promise<{ status: number; text: string }>

/** A site as the Sites API lists it, with the entity tag a conditional write names. */
type ApiSite = { siteId: string; company: string; name: string; halls: Array<string>; etag: string }

/** The sentences of a 412 of the Sites API: someone wrote the site between our read and our write. */
const SITE_MADE_MEANWHILE = "Someone made a site under the same name meanwhile: choose it from the list."
const SITE_CHANGED_MEANWHILE = "Someone changed the site meanwhile."
type ApiPlacement = { machineId: string; siteId: string; hall: string | null; displayName: string | null }

/** A refusal, and whether the list Home shows is out of date because of it. */
class Refused extends Error {
  readonly stale: boolean
  constructor(message: string, stale: boolean) {
    super(message)
    this.stale = stale
  }
}

async function read<T>(send: Send, path: string): Promise<T> {
  const { status, text } = await send(path, "GET")
  if (status !== 200) throw new Refused(refusalOf(status, text), false)
  return JSON.parse(text) as T
}

/** The sites and placements as the Sites API has them now. */
async function current(send: Send): Promise<{ sites: Array<ApiSite>; placements: Array<ApiPlacement> }> {
  const [sites, placements] = await Promise.all([read<Array<ApiSite>>(send, "/sites"), read<Array<ApiPlacement>>(send, "/placements")])
  return { sites, placements }
}

function at(id: string): string {
  return encodeURIComponent(id)
}

const spotOf = (placement: ApiPlacement | undefined): Spot | null =>
  placement === undefined ? null : { siteId: placement.siteId, hall: placement.hall }

const placedOf = (placement: ApiPlacement | undefined): Placed | null =>
  placement === undefined ? null : { siteId: placement.siteId, hall: placement.hall, displayName: placement.displayName }

/** Where a machine stands, in words, by the sites of the API. */
function whereOf(spot: Spot, sites: ReadonlyArray<ApiSite>): string {
  return placeInWords(sites.find((site) => site.siteId === spot.siteId)?.name ?? spot.siteId, spot.hall)
}

/** The sentence when a machine stands elsewhere than Home showed it. */
function changedMeanwhile(now: Spot | null, sites: ReadonlyArray<ApiSite>): string {
  return now === null ? "It was taken off its site meanwhile." : `It stands on ${whereOf(now, sites)} now: someone changed it meanwhile.`
}

/**
 * Puts a machine on a site, or moves it. A new site is made first, and a new hall is added to the
 * halls of its site as they are now. Where the machine stands elsewhere than Home showed it, nothing is
 * written: someone changed it meanwhile.
 */
export async function place(request: PlaceRequest, send: Send): Promise<PlaceOutcome> {
  const made: Made = {}
  try {
    const { sites, placements } = await current(send)
    const standing = placements.find((one) => one.machineId === request.machine)
    const now = spotOf(standing)
    if (!sameSpot(now, request.from)) {
      throw new Refused(
        request.from === null && now !== null ? `It already stands on ${whereOf(now, sites)}: someone placed it meanwhile.` : changedMeanwhile(now, sites),
        true,
      )
    }

    let site: ApiSite
    if ("siteId" in request.site) {
      const { siteId } = request.site
      const found = sites.find((one) => one.siteId === siteId)
      if (!found) throw new Refused(`The site '${siteId}' is no longer there.`, true)
      site = found
      if (request.hall !== null && request.newHall && !site.halls.includes(request.hall)) {
        // Only onto the site as it was read: a hall or a name someone changed meanwhile is not written over.
        const changed = { company: site.company, name: site.name, halls: hallsWith(site.halls, request.hall) }
        const answer = await send(`/sites/${at(site.siteId)}`, "PUT", changed, { ifMatch: site.etag })
        if (answer.status === 412) throw new Refused(SITE_CHANGED_MEANWHILE, true)
        if (answer.status !== 200) throw new Refused(refusalOf(answer.status, answer.text), true)
        site = { ...site, ...changed }
        made.hall = { siteId: site.siteId, hall: request.hall }
      }
    } else {
      const siteId = siteIdOf(request.site.name, new Set(sites.map((one) => one.siteId)))
      const created = { company: request.site.company, name: request.site.name, halls: request.hall === null ? [] : [request.hall] }
      // Only where there is no site of that id: one someone made meanwhile is not written over.
      const answer = await send(`/sites/${at(siteId)}`, "PUT", created, { ifNoneMatch: "*" })
      if (answer.status === 412) throw new Refused(SITE_MADE_MEANWHILE, true)
      if (answer.status !== 201) throw new Refused(refusalOf(answer.status, answer.text), true)
      site = { ...(JSON.parse(answer.text) as ApiSite), siteId }
      made.siteId = siteId
      made.siteEtag = site.etag
    }

    const placement = { siteId: site.siteId, hall: request.hall, displayName: request.displayName }
    const answer = await send(`/placements/${at(request.machine)}`, "PUT", placement)
    if (answer.status !== 200 && answer.status !== 201) throw new Refused(refusalOf(answer.status, answer.text), true)
    return { ok: true, siteId: site.siteId, siteName: site.name, hall: request.hall, before: placedOf(standing), made }
  } catch (error) {
    const reason = error instanceof Refused ? error.message : `The Sites API did not answer: ${reasonOf(error)}.`
    const kept =
      made.siteId !== undefined ? " The new site was made and stays." : made.hall !== undefined ? " The new hall was made and stays." : ""
    const wrote = made.siteId !== undefined || made.hall !== undefined
    return { ok: false, reason: `${reason}${kept}`, stale: wrote || (error instanceof Refused && error.stale) }
  }
}

/**
 * Takes a machine off its site, where it stands as Home showed it. One that stood on none is off it
 * already; one that stands elsewhere now is left there.
 */
export async function remove(request: RemoveRequest, send: Send): Promise<RemoveOutcome> {
  try {
    const { sites, placements } = await current(send)
    const standing = placements.find((one) => one.machineId === request.machine)
    if (standing === undefined) return { ok: true, already: true }
    if (!sameSpot(spotOf(standing), request.from)) throw new Refused(changedMeanwhile(spotOf(standing), sites), true)
    const { status, text } = await send(`/placements/${at(request.machine)}`, "DELETE")
    if (status === 404) return { ok: true, already: true }
    if (status !== 204) throw new Refused(refusalOf(status, text), false)
    const before: Placed = { siteId: standing.siteId, hall: standing.hall, displayName: standing.displayName }
    return { ok: true, already: false, before, siteName: sites.find((site) => site.siteId === before.siteId)?.name ?? before.siteId }
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.message, stale: error.stale }
    return { ok: false, reason: `The Sites API did not answer: ${reasonOf(error)}.`, stale: false }
  }
}

/**
 * Undoes a change: the machine goes back where it stood, but only while it still stands where the
 * change put it; then what the change made goes again while nothing stands on it. A site that someone
 * put a machine on meanwhile stays, and so does such a hall: the Sites API refuses with 409.
 */
export async function undo(request: UndoRequest, send: Send): Promise<UndoOutcome> {
  try {
    const placements = await read<Array<ApiPlacement>>(send, "/placements")
    const standing = placements.find((one) => one.machineId === request.machine)
    if (!sameSpot(spotOf(standing), request.now)) {
      return { ok: false, reason: "It was changed again meanwhile, so it stays where it is now." }
    }
    const path = `/placements/${at(request.machine)}`
    const answer = request.back === null ? await send(path, "DELETE") : await send(path, "PUT", request.back)
    const done = request.back === null ? [204, 404].includes(answer.status) : [200, 201].includes(answer.status)
    if (!done) throw new Refused(refusalOf(answer.status, answer.text), false)
    // 409 while a machine stands on it, 412 when someone changed it since it was made, 404 when someone
    // removed it already: in each case it stays as it is.
    if (request.made.siteId !== undefined) {
      await send(`/sites/${at(request.made.siteId)}`, "DELETE", undefined, request.made.siteEtag ? { ifMatch: request.made.siteEtag } : undefined)
    }
    if (request.made.hall !== undefined) await dropHall(request.made.hall, send)
    return { ok: true }
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.message }
    return { ok: false, reason: `The Sites API did not answer: ${reasonOf(error)}.` }
  }
}

/** Takes a hall off its site again, read as it is now, while no machine stands in it. */
async function dropHall({ siteId, hall }: Spot, send: Send): Promise<void> {
  const { sites, placements } = await current(send)
  const site = sites.find((one) => one.siteId === siteId)
  if (!site || hall === null || !site.halls.includes(hall)) return
  if (placements.some((one) => one.siteId === siteId && one.hall === hall)) return
  // The Sites API answers 409 if a machine was put in the hall since, 412 if the site was changed since it was
  // read: then the hall stays.
  const halls = site.halls.filter((one) => one !== hall)
  await send(`/sites/${at(siteId)}`, "PUT", { company: site.company, name: site.name, halls }, { ifMatch: site.etag })
}

/** The words of a toast after adding or moving: "P-07 added · North plant, Hall 2". */
export function placedInWords(title: string, siteName: string, hall: string | null, move: boolean): string {
  return `${title} ${move ? "moved" : "added"} · ${placeInWords(siteName, hall)}`
}
