import type { Cluster, FloorPage } from "./floor.ts"

// More a page can lay onto the shop floor of "Where is My Job?" (floor-view.tsx): the view opens with
// the first one it is given, and a switch above the map turns it off. The page is a showcase,
// routes/(showcases)/where-is-my-job.tsx, and gives its made-up orders this way (ADR-0018): this folder
// is of the app, needs no made-up data and reads nothing from a showcase.

export type FloorExtra = {
  id: string
  /** The name of the switch. */
  label: string
  /** What the page says while the extra is on, in place of its own words. */
  about: string
  decorate: (page: FloorPage, clusters: ReadonlyArray<Cluster>) => FloorPage
}
