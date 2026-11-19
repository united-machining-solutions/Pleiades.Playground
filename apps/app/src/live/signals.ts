import { SILENT_AFTER_SECONDS } from "@pleiades/cards/machine/contract.ts"
import { SERIES_SLOTS } from "@pleiades/cards/measurement/contract.ts"
import type { SeriesLine, TimeseriesSeries } from "@pleiades/cards/timeseries/contract.ts"

import { filterOf, machineOf, valuesOf } from "./messages.ts"

// Every signal of one machine, kept up to date from the broker: what the page of the live values shows
// when a machine is chosen. The backend lists what the machine published and gives the lines of the
// last minutes; every value the broker sends after that is laid onto them here, as on the graphs of
// all machines (measurements.ts).

type Point = { at: string; value: number | boolean }

/** The signals of the chosen machine. */
export type SignalsPage = {
  machine: string
  series: TimeseriesSeries
  /** The clock of the page: when the values were last moved on. */
  asOf: string
  /** The newest sign of life of the machine: any value it published. */
  lastSign: string | undefined
  /** For each line, by its topic, its newest value. */
  newest: Readonly<Record<string, Point>>
  /** For each line, by its topic, the values that came after the last instant of the graphs, oldest first. */
  pending: Readonly<Record<string, ReadonlyArray<Point>>>
  /** For each line, by its topic, the value that held at the last instant of the graphs. */
  held: Readonly<Record<string, number | boolean | null>>
}

/** The topics a page of one machine hears: every one of that machine. */
export function signalFilters(machine: string): Array<string> {
  return [filterOf("#", machine)]
}

/** The lines that can be drawn: a number or a yes or no, not a text. */
function drawable(line: SeriesLine): boolean {
  return line.note !== "text"
}

/** The end of each of `slots` even slots between two instants, in milliseconds: as the backend slots the graphs of all machines. */
function slotEnds(from: number, to: number, slots: number): Array<string> {
  const width = (to - from) / slots
  return Array.from({ length: slots }, (_, slot) => new Date(from + (slot + 1) * width).toISOString())
}

/**
 * A line of an answer on other instants: at each, the value it had at its own newest instant up to
 * there. That is the value that held, or none where its machine was silent, as the backend has it.
 */
function heldAt(values: SeriesLine["values"], own: ReadonlyArray<string>, instants: ReadonlyArray<string>): SeriesLine["values"] {
  let next = 0
  let held: SeriesLine["values"][number] = null
  return instants.map((end) => {
    while (next < own.length && own[next]! <= end) held = values[next++] ?? null
    return held
  })
}

/**
 * The page as the backend gave it: the lines of the machine, each with its newest value. The backend
 * draws so many lines at most at once, so they come in several answers, and an answer puts its lines
 * on instants of its own: those of their values. Here every line is put on the same even slots
 * instead, `slots` of them, as the graphs of all machines have them, so the lines of all answers meet
 * and the page moves on by whole slots. The slots end where the earliest answer ends. Null without an
 * answer.
 */
export function signalsPageOf(machine: string, answers: ReadonlyArray<TimeseriesSeries>, slots = SERIES_SLOTS): SignalsPage | null {
  const [first] = answers
  if (first === undefined) return null
  const to = Math.min(...answers.map((answer) => Date.parse(answer.to)))
  const from = to - (Date.parse(first.to) - Date.parse(first.from))
  const instants = slotEnds(from, to, slots)
  const newest: Record<string, Point> = {}
  const lines = answers.flatMap((answer) =>
    answer.lines
      .filter((line) => line.machine === machine && drawable(line))
      .map((line): SeriesLine => {
        // The newest value at the instant the backend gave it, not at the end of its slot.
        for (let index = line.values.length - 1; index >= 0; index--) {
          const value = line.values[index]
          if (value === null || value === undefined) continue
          newest[line.topic] = { at: answer.instants[index] ?? answer.to, value }
          break
        }
        return { ...line, values: heldAt(line.values, answer.instants, instants) }
      }),
  )
  const held: Record<string, number | boolean | null> = {}
  let lastSign: string | undefined
  for (const line of lines) {
    const last = line.values.at(-1) ?? null
    held[line.topic] = last
    if (last !== null) lastSign = new Date(to).toISOString()
  }
  const series = { from: new Date(from).toISOString(), to: new Date(to).toISOString(), range: first.range, instants, lines }
  return { machine, series, asOf: series.to, lastSign, newest, pending: {}, held }
}

function later(a: string | undefined, b: string): string {
  return a === undefined || b > a ? b : a
}

/**
 * What a message of the broker does to the page. `now`, in milliseconds since 1970, is the clock of
 * the server: a value stamped far ahead of it is left out.
 */
export function signalsWith(page: SignalsPage, topic: string, payload: string, now = Date.now()): SignalsPage {
  if (machineOf(topic) !== page.machine) return page
  const values = valuesOf(topic, payload, now)
  const first = values[0]
  if (first === undefined) return page
  // Every value is a sign of life, whatever it says.
  const lastSign = later(page.lastSign, first.value.at)
  let { newest, pending } = page
  for (const { topic: on, value } of values) {
    const line = page.series.lines.find((one) => one.topic === on)
    if (line === undefined || typeof value.value === "string") continue
    const point = { at: value.at, value: value.value }
    const before = newest[on]
    if (before === undefined || point.at >= before.at) newest = { ...newest, [on]: point }
    // A value after the last instant waits for the instant at which it holds. One from before is in the graphs already.
    if (point.at > page.series.to) pending = { ...pending, [on]: [...(pending[on] ?? []), point].sort((a, b) => a.at.localeCompare(b.at)) }
  }
  return { ...page, lastSign, newest, pending }
}

function silentAt(lastSign: string | undefined, at: number): boolean {
  return lastSign === undefined || at - Date.parse(lastSign) > SILENT_AFTER_SECONDS * 1000
}

/** True if the machine has been silent for longer than SILENT_AFTER_SECONDS: its values are the last known, not current. */
export function silentNow(page: SignalsPage): boolean {
  return silentAt(page.lastSign, Date.parse(page.asOf))
}

/**
 * The page at a later instant. The graphs move on by whole slots: at the end of each one, a line
 * holds its newest value, but not across a silence of its machine.
 */
export function signalsAt(page: SignalsPage, now: string): SignalsPage {
  const asOf = now > page.asOf ? now : page.asOf
  const { series } = page
  if (series.instants.length === 0) return { ...page, asOf }
  const time = Date.parse(now)
  const slot = (Date.parse(series.to) - Date.parse(series.from)) / series.instants.length
  const slots = Math.floor((time - Date.parse(series.to)) / slot)
  if (!(slots > 0)) return { ...page, asOf }

  const pending: Record<string, ReadonlyArray<Point>> = { ...page.pending }
  const held: Record<string, number | boolean | null> = { ...page.held }
  // After a long pause, a tab in the background for example, only the slots the graphs still show are worked out.
  const shown = Math.min(slots, series.instants.length)
  const ends = Array.from({ length: shown }, (_, index) => Date.parse(series.to) + (slots - shown + index + 1) * slot)
  const lines = series.lines.map((line) => {
    const added = ends.map((end) => {
      const waiting = pending[line.topic] ?? []
      const arrived = waiting.filter((point) => Date.parse(point.at) <= end)
      if (arrived.length > 0) {
        held[line.topic] = arrived.at(-1)!.value
        pending[line.topic] = waiting.slice(arrived.length)
      }
      if (silentAt(page.lastSign, end)) held[line.topic] = null
      return held[line.topic] ?? null
    })
    return { ...line, values: [...line.values, ...added].slice(-series.instants.length) }
  })
  const instants = [...series.instants, ...ends.map((end) => new Date(end).toISOString())].slice(-series.instants.length)
  return {
    ...page,
    asOf,
    pending,
    held,
    series: {
      ...series,
      from: new Date(Date.parse(series.from) + slots * slot).toISOString(),
      to: new Date(ends.at(-1)!).toISOString(),
      instants,
      lines,
    },
  }
}
