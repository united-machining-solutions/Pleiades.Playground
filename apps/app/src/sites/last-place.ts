import type { SiteList } from "@pleiades/cards/site/contract.ts"

import type { Backing } from "../pages/store.ts"
import type { Spot } from "./placing.ts"

// The site and hall a person added machines to last, in the localStorage of this browser: the next "Add a
// new machine" or "Assign machines to a site" starts there, as people add the machines of one hall one after
// the other. It is a convenience of this browser, nothing a service keeps. A site or hall that is gone since
// is not offered.

/** The key of the place. A new shape gets a new key. */
export const LAST_PLACE_KEY = "pleiades-playground.last-place.v1"

/** The place in what the storage holds, if it is one. */
function spotOf(raw: string | null | undefined): Spot | null {
  if (!raw) return null
  let held: unknown
  try {
    held = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof held !== "object" || held === null) return null
  const { siteId, hall } = held as Record<string, unknown>
  if (typeof siteId !== "string" || siteId === "") return null
  return { siteId, hall: typeof hall === "string" && hall !== "" ? hall : null }
}

/**
 * Where the last place stands in the list Home read: its site, and its hall where the site still has it.
 * Null where the site is gone or nothing is kept.
 */
export function lastPlaceIn(list: Pick<SiteList, "sites">, kept: Spot | null): Spot | null {
  if (kept === null) return null
  const site = list.sites.find((one) => one.siteId === kept.siteId)
  if (!site) return null
  const hall = kept.hall !== null && site.halls.some((one) => one.name === kept.hall) ? kept.hall : null
  return { siteId: site.siteId, hall }
}

/** The place of one storage. The app has one, for `localStorage` (below); a test makes its own. */
export function createLastPlace(backing: () => Backing | undefined) {
  return {
    /** The place kept last, or null where none is kept or the storage cannot be read. */
    readLastPlace(): Spot | null {
      try {
        return spotOf(backing()?.getItem(LAST_PLACE_KEY))
      } catch {
        return null
      }
    },
    /** Keeps the place; a storage that refuses keeps nothing, and nothing else changes. */
    keepLastPlace(spot: Spot): void {
      try {
        backing()?.setItem(LAST_PLACE_KEY, JSON.stringify(spot))
      } catch {
        // A full or blocked storage: the next dialog starts empty.
      }
    },
  }
}

export const { readLastPlace, keepLastPlace } = createLastPlace(() => (typeof window === "undefined" ? undefined : window.localStorage))
