import { writtenOn } from "../energy/words.ts"
import { lasting, written } from "../machine/format.ts"
import type { NotificationEntry, NotificationList } from "./contract.ts"

// The words of the notification card, shared by the card and by the result in words. A time is
// written by the caller's `Time`: the card in the clock of the browser, the words as the result
// has it.

export type Time = (instant: string) => string

/**
 * An instant as the result writes it: the time of day, and the day too where it is not the day of
 * `asOf`, because the card reaches back 24 hours: 09:05, or 15 Nov 21:40.
 */
export function stamped(instant: string, asOf: string): string {
  return writtenOn(instant, instant.slice(0, 10) !== asOf.slice(0, 10), written)
}

/** How long something stood: seconds where it is under a minute, because an alert often stands for seconds. */
export function span(seconds: number): string {
  // The unit changes where the rounded number does, so 59.5 s reads 1 min and never 60 s.
  const whole = Math.round(seconds)
  return whole < 60 ? `${whole} s` : lasting(whole * 1000)
}

/**
 * What became of an alert: that it is still open, or when it went and how long it stood. Where it
 * came and went in the same minute the duration is enough.
 */
export function outcomeText(entry: NotificationEntry, time: Time): { open: boolean; text: string } {
  if (entry.goneAt === null) return { open: true, text: "still open" }
  const lasted = entry.durationSeconds === null ? null : `lasted ${span(entry.durationSeconds)}`
  if (lasted !== null && time(entry.raisedAt) === time(entry.goneAt)) return { open: false, text: lasted }
  return { open: false, text: [`gone ${time(entry.goneAt)}`, lasted].filter(Boolean).join(" · ") }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** The levels of a list as counts: 1 error and 2 warnings. A level without any is left out. */
export function levelsInWords({ levels }: Pick<NotificationList, "levels">): string {
  const parts = [
    levels.error.count > 0 ? plural(levels.error.count, "error", "errors") : "",
    levels.warning.count > 0 ? plural(levels.warning.count, "warning", "warnings") : "",
  ].filter(Boolean)
  return parts.join(" and ")
}

/**
 * How long the alerts of each level stood in the range, in total: In the range, errors stood 12 min
 * in total, warnings 5 min in total. Only the time in the range counts, not the whole duration of an alert.
 */
export function totalsInWords({ levels }: Pick<NotificationList, "levels">): string {
  const parts: Array<[name: string, seconds: number]> = []
  if (levels.error.count > 0) parts.push(["errors", levels.error.seconds])
  if (levels.warning.count > 0) parts.push(["warnings", levels.warning.seconds])
  const said = parts.map(([name, seconds], position) => `${name}${position === 0 ? " stood" : ""} ${span(seconds)} in total`)
  return `In the range, ${said.join(", ")}`
}
