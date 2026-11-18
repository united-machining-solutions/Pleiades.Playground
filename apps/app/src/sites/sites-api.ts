import { createServerFn } from "@tanstack/react-start"

import { place, remove, undo } from "./placements.ts"
import type { Send } from "./placements.ts"
import { placeRequestOf, removeRequestOf, undoRequestOf } from "./placing.ts"
import type { PlaceOutcome, RemoveOutcome, UndoOutcome } from "./placing.ts"

// The steps of a person on Home: adding a machine to a site, moving it, taking it off, and undoing
// either. They go to the REST endpoints of the Sites API from the server of the app, never from the
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

/** Undoes a change from its toast, while nothing changed the machine since. */
export const undoChange = createServerFn({ method: "POST" })
  .validator(undoRequestOf)
  .handler(({ data }): Promise<UndoOutcome> => {
    const base = sitesApiUrl()
    return base ? undo(data, sender(base)) : Promise.resolve({ ok: false, reason: NO_API })
  })
