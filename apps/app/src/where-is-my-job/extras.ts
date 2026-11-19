import type { Cluster, FloorPage } from "./floor.ts"

// More the page "Where is My Job?" can lay onto the shop floor: the page opens with the first, and a
// switch above the map turns it off.
// The page itself has none: a showcase adds one when it is built in (ADR-0018), so a build without
// the showcases has no switch, and the page never reads from a showcase.

export type FloorExtra = {
  id: string
  /** The name of the switch. */
  label: string
  /** What the page says while the extra is on, in place of its own words. */
  about: string
  decorate: (page: FloorPage, clusters: ReadonlyArray<Cluster>) => FloorPage
}

const extras: Array<FloorExtra> = []

/** Offers an extra on the page; one with the same id is offered once. */
export function addFloorExtra(extra: FloorExtra): void {
  if (!extras.some((one) => one.id === extra.id)) extras.push(extra)
}

/** The extras offered, in the order they were added. */
export function floorExtras(): ReadonlyArray<FloorExtra> {
  return extras
}
