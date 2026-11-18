// Who stands in front of the camera now, checked again every few seconds while someone is there. A new
// name counts only once it was seen twice in a row, so that one doubtful look does not rename anyone.
// Plain logic, tested with `node --test`.

/** How often the face of someone who is there is compared again. */
export const RECHECK_MS = 3_000
/** How many looks in a row a new name needs before it counts. */
export const CONFIRM_NAME = 2

export type IdentityState = {
  /** The name that counts now; undefined for nobody or someone unknown. */
  name?: string
  /** A different name (or unknown, as null) seen lately, and how often in a row. */
  candidate?: { name: string | null; looks: number }
}

export const initialIdentity: IdentityState = {}

/**
 * Takes one comparison: the name it found, or undefined for a face nobody enrolled. Says whether the
 * name that counts changed.
 */
export function recheck(state: IdentityState, seen: string | undefined): { state: IdentityState; changed: boolean } {
  if (seen === state.name) return { state: { name: state.name }, changed: false }
  const key = seen ?? null
  const looks = state.candidate?.name === key ? state.candidate.looks + 1 : 1
  if (looks < CONFIRM_NAME) return { state: { name: state.name, candidate: { name: key, looks } }, changed: false }
  return { state: { name: seen }, changed: true }
}

/** Someone arrived and was named, or nobody is there any more: the name counts at once. */
export function settle(name: string | undefined): IdentityState {
  return { name }
}
