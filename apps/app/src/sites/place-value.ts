import type { HallChoice, SiteChoice } from "./choosing.ts"

// A place as a person chooses it with the chips of place-chips.tsx: the site, its hall, and the company of a
// new site; and whether it is chosen whole.

/** A place as chosen: the site, its hall (null while not chosen; NO_HALL for none), and the company of a new site. */
export type PlaceValue = { site: SiteChoice | null; hall: HallChoice | null; company: string }

/** Whether a place is chosen whole: a site with a name, its hall or none, a new hall with a name, a new site with a company. */
export function placeReady({ site, hall, company }: PlaceValue): boolean {
  if (site === null || site.name.trim() === "" || hall === null) return false
  if (hall.made && (hall.name ?? "").trim() === "") return false
  return site.siteId !== null || company.trim() !== ""
}
