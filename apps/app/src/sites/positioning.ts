import type { Position, SiteList } from "@pleiades/cards/site/contract.ts"
import { FARTHEST } from "@pleiades/cards/site/plan.ts"

import { reasonOf } from "../reason.ts"
import type { Send } from "./placements.ts"
import { problemOfId, refusalOf } from "./placing.ts"

// Where in its hall a machine stands: the step of a person on the page Halls, who drags a machine on
// the plan of its hall. It goes to the REST endpoint of the Sites API from the server of the app
// (sites-api.ts), never from the browser and never from the language model. The API checks everything
// again.

/** A machine moved on the plan of its hall: where it stands now, x and y in metre. */
export type PositionRequest = { machine: string; position: Position }

/** What became of it: done, or why not. */
export type PositionOutcome = { ok: true } | { ok: false; reason: string }

const onThePlan = (metre: unknown): metre is number => typeof metre === "number" && metre >= 0 && metre <= FARTHEST

/** Checks what the page sends, before anything goes to the Sites API. Throws the sentence of the problem. */
export function positionRequestOf(value: unknown): PositionRequest {
  const given = (value ?? {}) as Record<string, unknown>
  const problem = problemOfId(given.machine, "machine id")
  if (problem) throw new Error(problem)
  const position = (given.position ?? {}) as Record<string, unknown>
  if (!onThePlan(position.x) || !onThePlan(position.y)) {
    throw new Error(`The position lies between 0 and ${FARTHEST} metre in x and in y.`)
  }
  return { machine: given.machine as string, position: { x: position.x, y: position.y } }
}

/** Says where in its hall a machine stands. Nothing else of where it stands changes. */
export async function position(request: PositionRequest, send: Send): Promise<PositionOutcome> {
  try {
    const { status, text } = await send(`/placements/${encodeURIComponent(request.machine)}/position`, "PUT", request.position)
    if (status === 200) return { ok: true }
    if (status === 404) return { ok: false, reason: "It stands on no site any more: someone took it off meanwhile." }
    return { ok: false, reason: refusalOf(status, text) }
  } catch (error) {
    return { ok: false, reason: `The Sites API did not answer: ${reasonOf(error)}.` }
  }
}

/**
 * The list with the positions a person just gave on the plan, until the list is read again: a machine
 * stands where it was dropped at once. A site, a hall or a machine without such a position stays the
 * same object.
 */
export function withPositions(list: SiteList, moved: ReadonlyMap<string, Position>): SiteList {
  if (moved.size === 0) return list
  let changed = false
  const sites = list.sites.map((site) => {
    let siteChanged = false
    const halls = site.halls.map((hall) => {
      if (!hall.machines.some((one) => moved.has(one.machine))) return hall
      siteChanged = true
      return { ...hall, machines: hall.machines.map((one) => (moved.has(one.machine) ? { ...one, position: moved.get(one.machine) } : one)) }
    })
    if (!siteChanged) return site
    changed = true
    return { ...site, halls }
  })
  return changed ? { ...list, sites } : list
}
