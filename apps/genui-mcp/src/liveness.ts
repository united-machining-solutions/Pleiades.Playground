import { SILENT_AFTER_SECONDS } from "@pleiades/cards/machine/contract.ts"

// Whether a machine is there. Every value it publishes is a sign of life: the values of its
// state, and the heartbeat, which is there for nothing else. A machine may publish its state only
// when it changes, so one quiet topic says nothing. A machine is silent when all of them are.

/** A stretch of time in milliseconds since 1970: from its first instant to the first one after it. */
export type Stretch = { from: number; to: number }

/**
 * The stretches between two instants in which a machine was silent: for longer than
 * SILENT_AFTER_SECONDS without a sign of life. The signs should begin that long before `from`:
 * without a sign from then, the machine counts as silent where the stretch begins.
 */
export function silences(signs: ReadonlyArray<string>, from: string, to: string): Array<Stretch> {
  const start = Date.parse(from)
  const end = Date.parse(to)
  const times = signs.map((sign) => Date.parse(sign)).sort((a, b) => a - b)

  const stretches: Array<Stretch> = []
  // The last instant up to which the signs so far say that the machine is there.
  let thereUntil = -Infinity
  for (const time of [...times, Infinity]) {
    const silent = { from: Math.max(thereUntil + 1, start), to: Math.min(time, end) }
    if (silent.from < silent.to) stretches.push(silent)
    thereUntil = Math.max(thereUntil, time + SILENT_AFTER_SECONDS * 1000)
  }
  return stretches
}

/** Whether the machine was silent at some time between two instants. */
export function silentBetween(stretches: ReadonlyArray<Stretch>, earlier: string, later: string): boolean {
  const from = Date.parse(earlier)
  const to = Date.parse(later)
  return stretches.some((one) => one.from < to && one.to > from)
}

/** Whether the machine was silent at that instant. */
export function silentAt(stretches: ReadonlyArray<Stretch>, at: number): boolean {
  return stretches.some((one) => one.from <= at && at < one.to)
}
