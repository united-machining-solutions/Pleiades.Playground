// Where a time axis puts its marks: on round times of the clock, full hours or quarter hours, in the
// time zone of the browser, as a person reads a clock. Not where a chart library happens to divide
// the width, which gives 12:59, 13:30, 14:02.

/** The steps an axis may take, in minutes, the finest first. */
const STEPS = [5, 15, 30, 60, 120, 180, 240, 360, 720] as const

/** How many marks an axis has at most, so their times do not run into each other. */
export const MOST_TICKS = 8

/**
 * The instants of the marks between `from` and `to`, in milliseconds: on the finest step of the
 * clock that gives no more than `most` marks. A quarter hour marks a range of an hour, a full hour
 * one of eight, every third hour one of a day.
 */
export function timeTicks(from: number, to: number, most: number = MOST_TICKS): Array<number> {
  if (!(to > from)) return []
  const minutes = (to - from) / 60_000
  const step = STEPS.find((one) => minutes / one <= most) ?? STEPS[STEPS.length - 1]
  const ticks: Array<number> = []
  for (let at = firstOnStep(from, step); at.getTime() <= to; at = next(at, step)) {
    if (at.getTime() >= from) ticks.push(at.getTime())
  }
  return ticks
}

/** The first round time at or after `from`: a multiple of the step on the clock of the browser. */
function firstOnStep(from: number, step: number): Date {
  const at = new Date(from)
  at.setSeconds(0, 0)
  if (at.getTime() < from) at.setMinutes(at.getMinutes() + 1)
  if (step < 60) {
    while (at.getMinutes() % step !== 0) at.setMinutes(at.getMinutes() + 1)
    return at
  }
  if (at.getMinutes() !== 0) at.setHours(at.getHours() + 1, 0)
  while (at.getHours() % (step / 60) !== 0) at.setHours(at.getHours() + 1)
  return at
}

/** The next mark, on the clock: across a change of summer time a full hour stays a full hour. */
function next(at: Date, step: number): Date {
  const then = new Date(at)
  if (step < 60) then.setMinutes(then.getMinutes() + step)
  else then.setHours(then.getHours() + step / 60)
  return then
}
