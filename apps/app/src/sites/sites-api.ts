import { createServerFn } from "@tanstack/react-start"

import { makeHallAlone, makeSiteAlone, place, placeAdded, remove, sitesOf, undo, unmake } from "./placements.ts"
import type { Send } from "./placements.ts"
import { addedRequestOf, makeHallRequestOf, makeSiteRequestOf, placeRequestOf, removeRequestOf, undoMadeRequestOf, undoRequestOf } from "./placing.ts"
import type { AddedOutcome, MakeOutcome, PlaceOutcome, RemoveOutcome, SitesOutcome, UndoOutcome } from "./placing.ts"
import { position, positionRequestOf } from "./positioning.ts"
import type { PositionOutcome } from "./positioning.ts"

// The steps of a person on Home: adding a machine to a site, moving it, taking it off, and undoing
// either; making a site or a hall alone, and undoing that; the step of a person on Halls: saying where in its
// hall a machine stands; and putting a machine a person added over OPC UA on a site. They go to the REST
// endpoints of the Sites API from the server of the app, never from the
// browser and never from the language model: no tool of the chat writes a site or a placement.

/** Where the Sites API answers, or undefined if the app has none. */
export function sitesApiUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = (env.SITES_API_URL ?? "http://localhost:5540").trim()
  return url ? url.replace(/\/+$/, "") : undefined
}

const NO_API = "The app has no Sites API (SITES_API_URL is empty)."

function sender(base: string): Send {
  return async (path, method, body, conditions) => {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers["content-type"] = "application/json"
    if (conditions?.ifMatch) headers["if-match"] = conditions.ifMatch
    if (conditions?.ifNoneMatch) headers["if-none-match"] = conditions.ifNoneMatch
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      signal: AbortSignal.timeout(15_000),
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
    return { status: response.status, text: await response.text() }
  }
}

/** Puts a machine on a site, or moves it, and makes the site or the hall first where the person asked for a new one. */
export const placeMachine = createServerFn({ method: "POST" })
  .validator(placeRequestOf)
  .handler(({ data }): Promise<PlaceOutcome> => {
    const base = sitesApiUrl()
    return base ? place(data, sender(base)) : Promise.resolve({ ok: false, reason: NO_API, stale: false })
  })

/** Takes a machine off its site. Its values and notifications stay. */
export const removePlacement = createServerFn({ method: "POST" })
  .validator(removeRequestOf)
  .handler(({ data }): Promise<RemoveOutcome> => {
    const base = sitesApiUrl()
    return base ? remove(data, sender(base)) : Promise.resolve({ ok: false, reason: NO_API, stale: false })
  })

/** Says where in its hall a machine stands, after a person moved it on the plan of the hall. */
export const positionMachine = createServerFn({ method: "POST" })
  .validator(positionRequestOf)
  .handler(({ data }): Promise<PositionOutcome> => {
    const base = sitesApiUrl()
    return base ? position(data, sender(base)) : Promise.resolve({ ok: false, reason: NO_API })
  })

/** The sites there are, for the card of an OPC UA proposal to put the machine it adds on one. */
export const listSites = createServerFn({ method: "GET" }).handler((): Promise<SitesOutcome> => {
  const base = sitesApiUrl()
  return base ? sitesOf(sender(base)) : Promise.resolve({ ok: false, reason: NO_API })
})

/** Puts a machine that was just added over OPC UA on a site, unless it stands on one already. */
export const placeAddedMachine = createServerFn({ method: "POST" })
  .validator(addedRequestOf)
  .handler(({ data }): Promise<AddedOutcome> => {
    const base = sitesApiUrl()
    return base ? placeAdded(data, sender(base)) : Promise.resolve({ ok: false, reason: NO_API })
  })

/** Undoes a change from its toast, while nothing changed the machine since. */
export const undoChange = createServerFn({ method: "POST" })
  .validator(undoRequestOf)
  .handler(({ data }): Promise<UndoOutcome> => {
    const base = sitesApiUrl()
    return base ? undo(data, sender(base)) : Promise.resolve({ ok: false, reason: NO_API })
  })

/** Makes a site without a machine, with a first hall or none, only where no site of its id is there. */
export const makeSite = createServerFn({ method: "POST" })
  .validator(makeSiteRequestOf)
  .handler(({ data }): Promise<MakeOutcome> => {
    const base = sitesApiUrl()
    return base ? makeSiteAlone(data, sender(base)) : Promise.resolve({ ok: false, reason: NO_API, stale: false })
  })

/** Adds a hall to a site, only onto the site as it was read. */
export const makeHall = createServerFn({ method: "POST" })
  .validator(makeHallRequestOf)
  .handler(({ data }): Promise<MakeOutcome> => {
    const base = sitesApiUrl()
    return base ? makeHallAlone(data, sender(base)) : Promise.resolve({ ok: false, reason: NO_API, stale: false })
  })

/** Undoes a site or hall made alone, while nothing stands on it and nobody changed it since. */
export const undoMade = createServerFn({ method: "POST" })
  .validator(undoMadeRequestOf)
  .handler(({ data }): Promise<UndoOutcome> => {
    const base = sitesApiUrl()
    return base ? unmake(data, sender(base)) : Promise.resolve({ ok: false, reason: NO_API })
  })
