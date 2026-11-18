import type { Sample } from "./axes.ts"

// The cell publishes a position about once a second, and only when it changed. Drawn as it comes, the model
// would jump, or run and stand still. A track moves one axis from where it is drawn to the newest position at
// constant speed, over the time that lay between the last two measurements. When the positions come at an even
// pace, the axis moves without a stop, one interval behind the cell.

/** The shortest and the longest time a move may take, in milliseconds. */
const SHORTEST_MS = 100
const LONGEST_MS = 2_000

export class Track {
  private from = 0
  private to = 0
  private start = 0
  private span = 1
  /** When the newest position was measured; null until the first one came. */
  private measured: number | null = null

  /** Takes a position of the cell. `now` is the clock of the page in milliseconds; a position seen before is ignored. */
  push(sample: Sample, now: number): void {
    if (sample.at === this.measured) return
    if (this.measured === null) {
      // The first position: the axis stands there, with nothing to move from.
      this.from = sample.value
      this.to = sample.value
    } else {
      this.from = this.at(now) ?? sample.value
      this.to = sample.value
      this.span = Math.min(LONGEST_MS, Math.max(SHORTEST_MS, sample.at - this.measured))
    }
    this.start = now
    this.measured = sample.at
  }

  /** Where the axis is drawn at `now`; null until the first position came. */
  at(now: number): number | null {
    if (this.measured === null) return null
    const part = Math.min(1, Math.max(0, (now - this.start) / this.span))
    return this.from + (this.to - this.from) * part
  }
}
