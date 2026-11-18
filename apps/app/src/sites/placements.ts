import { hallsWith, placeInWords, refusalOf, siteIdOf } from "./placing.ts"
import type { PlaceOutcome, PlaceRequest, RemoveOutcome } from "./placing.ts"

// The steps of placing a machine and of taking it off its site, against the REST endpoints of the
// Sites API. They run on the server of the app (sites-api.ts), never in the browser and never as a
// tool of the language model. The API checks everything again; these steps only keep a person from
// overwriting what someone else did meanwhile.

/** One request to the Sites API: its status and its text. A network failure throws. */
export type Send = (path: string, method: "GET" | "PUT" | "DELETE", body?: unknown) => Promise<{ status: number; text: string }>

type ApiSite = { siteId: string; company: string; name: string; halls: Array<string> }
type ApiPlacement = { machineId: string; siteId: string; hall: string | null; displayName: string | null }

/** A refusal that came after something was written already: the list Home shows is out of date. */
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

function at(id: string): string {
  return encodeURIComponent(id)
}

/**
 * Puts a machine on a site, or moves it. A new site is made first, and a new hall is added to the
 * halls of its site as they are now. A machine that is to be placed and stands on a site already is
 * left where it is: someone placed it meanwhile.
 */
export async function place(request: PlaceRequest, send: Send): Promise<PlaceOutcome> {
  let made: string | undefined
  try {
    const sites = await read<Array<ApiSite>>(send, "/sites")
    if (!request.move) {
      const placements = await read<Array<ApiPlacement>>(send, "/placements")
      const standing = placements.find((one) => one.machineId === request.machine)
      if (standing) {
        const where = sites.find((site) => site.siteId === standing.siteId)?.name ?? standing.siteId
        throw new Refused(`It already stands on ${where}: someone placed it meanwhile.`, true)
      }
    }

    let site: ApiSite
    if ("siteId" in request.site) {
      const { siteId } = request.site
      const found = sites.find((one) => one.siteId === siteId)
      if (!found) throw new Refused(`The site '${siteId}' is no longer there.`, true)
      site = found
      if (request.hall !== null && request.newHall && !site.halls.includes(request.hall)) {
        const changed = { company: site.company, name: site.name, halls: hallsWith(site.halls, request.hall) }
        const answer = await send(`/sites/${at(site.siteId)}`, "PUT", changed)
        if (answer.status !== 200) throw new Refused(refusalOf(answer.status, answer.text), true)
        site = { ...site, ...changed }
      }
    } else {
      const siteId = siteIdOf(request.site.name, new Set(sites.map((one) => one.siteId)))
      const created = { company: request.site.company, name: request.site.name, halls: request.hall === null ? [] : [request.hall] }
      const answer = await send(`/sites/${at(siteId)}`, "PUT", created)
      if (answer.status !== 201) throw new Refused(refusalOf(answer.status, answer.text), true)
      site = { siteId, ...created }
      made = site.name
    }

    const placement = { siteId: site.siteId, hall: request.hall, displayName: request.displayName }
    const answer = await send(`/placements/${at(request.machine)}`, "PUT", placement)
    if (answer.status !== 200 && answer.status !== 201) throw new Refused(refusalOf(answer.status, answer.text), true)
    return { ok: true, siteName: site.name, hall: request.hall }
  } catch (error) {
    const reason = error instanceof Refused ? error.message : `The Sites API did not answer: ${causeOf(error)}.`
    const kept = made === undefined ? "" : ` The site ${made} was made and stays.`
    return { ok: false, reason: `${reason}${kept}`, stale: made !== undefined || (error instanceof Refused && error.stale) }
  }
}

/** Takes a machine off its site. One that stood on none is off it already. */
export async function remove(machine: string, send: Send): Promise<RemoveOutcome> {
  try {
    const { status, text } = await send(`/placements/${at(machine)}`, "DELETE")
    if (status === 204) return { ok: true, already: false }
    if (status === 404) return { ok: true, already: true }
    return { ok: false, reason: refusalOf(status, text) }
  } catch (error) {
    return { ok: false, reason: `The Sites API did not answer: ${causeOf(error)}.` }
  }
}

/** The innermost cause of a failed request, for example ECONNREFUSED: `fetch` wraps it in an error of its own. */
function causeOf(error: unknown): string {
  let innermost = error
  while (innermost instanceof Error && innermost.cause !== undefined) innermost = innermost.cause
  const { code, message } = (innermost ?? {}) as { code?: unknown; message?: unknown }
  return String(code ?? message ?? innermost)
}

/** The words of a toast after adding or moving: "P-07 added · North plant, Hall 2". */
export function placedInWords(title: string, siteName: string, hall: string | null, move: boolean): string {
  return `${title} ${move ? "moved" : "added"} · ${placeInWords(siteName, hall)}`
}
