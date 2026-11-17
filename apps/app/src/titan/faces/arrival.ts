// When someone arrives: a face after a while without one. Plain logic, fed with one look at the camera
// at a time, so that it is tested with `node --test`.

/** One look at the camera: whether a face was there, and whose, if it was recognised. */
export type Sample = { face: boolean; name?: string }

export type Arrival = { name?: string }

export type ArrivalOptions = {
  /** How long nobody must have been there before a face is an arrival, in milliseconds. */
  absentMs?: number
  /** How many looks with a face an arrival waits for a name before it goes without one. */
  confirmLooks?: number
}

export const ABSENT_MS = 10_000
export const CONFIRM_LOOKS = 3

export type ArrivalState = {
  /** When a face was seen last; undefined before the first one. */
  lastFace?: number
  /** Someone is there and was announced, or is about to be. */
  present: boolean
  /** Looks with a face since the arrival began, while it waits for a name. */
  pending?: number
}

export const initialArrival: ArrivalState = { present: false }

/**
 * Takes one look and says whether it completes an arrival. A face after `absentMs` without one begins
 * an arrival; it is announced with the first name it gets, or without one after `confirmLooks` looks
 * with a face. One look with a face and then nobody again is a glitch: it is dropped without a word.
 */
export function observe(
  state: ArrivalState,
  now: number,
  sample: Sample,
  { absentMs = ABSENT_MS, confirmLooks = CONFIRM_LOOKS }: ArrivalOptions = {},
): { state: ArrivalState; arrival?: Arrival } {
  if (!sample.face) {
    const gone = state.lastFace === undefined || now - state.lastFace >= absentMs
    if (!state.present || !gone) return { state }
    return { state: { lastFace: state.lastFace, present: false } }
  }

  const returning = state.present
  if (returning && state.pending === undefined) return { state: { ...state, lastFace: now } }

  const looks = (state.pending ?? 0) + 1
  if (sample.name) return { state: { lastFace: now, present: true }, arrival: { name: sample.name } }
  if (looks >= confirmLooks) return { state: { lastFace: now, present: true }, arrival: {} }
  return { state: { lastFace: now, present: true, pending: looks } }
}
