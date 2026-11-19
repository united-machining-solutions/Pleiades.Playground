import assert from "node:assert/strict"
import { test } from "node:test"

import type { TimeseriesSeries } from "@pleiades/cards/timeseries/contract.ts"

import { signalFilters, signalsAt, signalsPageOf, signalsWith, silentNow } from "./signals.ts"

const value = (timestamp: string, written: unknown, unit?: string) =>
  JSON.stringify({ timestamp, value: written, ...(unit ? { unit } : {}) })
const P04 = "alcyone-machines_AX-400_P-04"
const M02 = "merope-microtec_MM-120_M-02"
const override = `machines/${P04}/umati/Spindle/1/Override`
const program = `machines/${P04}/umati/Program/Name`
/** The clock of the server in these tests: after every value they send, so none is stamped ahead of it. */
const NOW = Date.parse("2026-11-16T09:32:00Z")

/** Four slots of five seconds, 09:29:40 to 09:30:00: the spindle override of P-04, and a text, which draws no line. */
const series: TimeseriesSeries = {
  from: "2026-11-16T09:29:40.000Z",
  to: "2026-11-16T09:30:00.000Z",
  range: "15m",
  instants: ["2026-11-16T09:29:45.000Z", "2026-11-16T09:29:50.000Z", "2026-11-16T09:29:55.000Z", "2026-11-16T09:30:00.000Z"],
  lines: [
    { machine: P04, path: "umati/Spindle/1/Override", topic: override, kind: "number", unit: "percent", values: [90, 95, null, 100], note: null },
    { machine: P04, path: "umati/Program/Name", topic: program, kind: "number", unit: null, values: [null, null, null, null], note: "text" },
  ],
}

test("the page of a machine hears every topic of that machine", () => {
  assert.deepEqual(signalFilters(P04), [`machines/${P04}/#`])
})

test("the page keeps the lines that draw, each with its newest value", () => {
  const page = signalsPageOf(P04, [series], 4)!
  assert.deepEqual(
    page.series.lines.map((line) => line.topic),
    [override],
  )
  assert.deepEqual(page.newest[override], { at: "2026-11-16T09:30:00.000Z", value: 100 })
  assert.equal(page.lastSign, series.to)
})

test("a value of the machine becomes its newest and waits for the slot it holds in", () => {
  const page = signalsWith(signalsPageOf(P04, [series], 4)!, override, value("2026-11-16T09:30:02Z", 110, "percent"), NOW)
  assert.deepEqual(page.newest[override], { at: "2026-11-16T09:30:02.000Z", value: 110 })
  assert.deepEqual(page.pending[override], [{ at: "2026-11-16T09:30:02.000Z", value: 110 }])
  assert.equal(page.lastSign, "2026-11-16T09:30:02.000Z")

  const later = signalsAt(page, "2026-11-16T09:30:05.000Z")
  assert.deepEqual(later.series.lines[0]?.values, [95, null, 100, 110])
  assert.equal(later.series.to, "2026-11-16T09:30:05.000Z")
})

test("a value of another machine leaves the page as it is", () => {
  const page = signalsPageOf(P04, [series], 4)!
  assert.equal(signalsWith(page, `machines/${M02}/umati/Spindle/1/Override`, value("2026-11-16T09:30:02Z", 50), NOW), page)
})

test("a machine silent for long has no current value, and its lines stop", () => {
  const page = signalsAt(signalsPageOf(P04, [series], 4)!, "2026-11-16T09:31:00.000Z")
  assert.equal(silentNow(page), true)
  assert.equal(page.series.lines[0]?.values.at(-1), null)
})

const feed = `machines/${P04}/umati/Feed/Override`

test("the lines of answers with instants of their own meet on the same slots", () => {
  // The backend gives each answer the instants of its own values: these two have none in common, and
  // the second ends a few milliseconds later. The slots end where the earlier one ends.
  const first: TimeseriesSeries = {
    from: "2026-11-16T09:29:40.000Z",
    to: "2026-11-16T09:30:00.000Z",
    range: "15m",
    instants: ["2026-11-16T09:29:43.000Z", "2026-11-16T09:29:52.000Z", "2026-11-16T09:30:00.000Z"],
    lines: [{ machine: P04, path: "umati/Spindle/1/Override", topic: override, kind: "number", unit: "percent", values: [90, 95, 95], note: null }],
  }
  const second: TimeseriesSeries = {
    from: "2026-11-16T09:29:40.010Z",
    to: "2026-11-16T09:30:00.010Z",
    range: "15m",
    instants: ["2026-11-16T09:29:41.000Z", "2026-11-16T09:29:58.000Z", "2026-11-16T09:30:00.010Z"],
    lines: [{ machine: P04, path: "umati/Feed/Override", topic: feed, kind: "number", unit: "percent", values: [80, 100, 100], note: null }],
  }
  const page = signalsPageOf(P04, [first, second], 4)!
  assert.deepEqual(page.series.instants, ["2026-11-16T09:29:45.000Z", "2026-11-16T09:29:50.000Z", "2026-11-16T09:29:55.000Z", "2026-11-16T09:30:00.000Z"])
  assert.equal(page.series.to, "2026-11-16T09:30:00.000Z")
  assert.deepEqual(page.series.lines.map((line) => [line.topic, line.values]), [
    [override, [90, 90, 95, 95]],
    [feed, [80, 80, 80, 100]],
  ])
  // The newest value keeps the instant the backend gave it.
  assert.deepEqual(page.newest[feed], { at: "2026-11-16T09:30:00.010Z", value: 100 })
})

test("a silence of the machine stays a gap on the slots", () => {
  const silent: TimeseriesSeries = {
    from: "2026-11-16T09:29:40.000Z",
    to: "2026-11-16T09:30:00.000Z",
    range: "15m",
    // It held 90 up to 09:29:47, and was silent a millisecond after.
    instants: ["2026-11-16T09:29:42.000Z", "2026-11-16T09:29:47.000Z", "2026-11-16T09:29:47.001Z", "2026-11-16T09:30:00.000Z"],
    lines: [{ machine: P04, path: "umati/Spindle/1/Override", topic: override, kind: "number", unit: "percent", values: [90, 90, null, null], note: null }],
  }
  const page = signalsPageOf(P04, [silent], 4)!
  assert.deepEqual(page.series.lines[0]?.values, [90, null, null, null])
  assert.equal(page.lastSign, undefined)
})

test("the page moves on by its slots, whatever instants the backend gave", () => {
  // Three instants in 20 seconds would be a slot of almost seven; the slots are five.
  const sparse: TimeseriesSeries = { ...series, instants: ["2026-11-16T09:29:40.000Z", "2026-11-16T09:29:51.000Z", "2026-11-16T09:30:00.000Z"], lines: [{ ...series.lines[0]!, values: [90, 95, 100] }] }
  const later = signalsAt(signalsPageOf(P04, [sparse], 4)!, "2026-11-16T09:30:05.000Z")
  assert.equal(later.series.instants.length, 4)
  assert.equal(later.series.instants.at(-1), "2026-11-16T09:30:05.000Z")
  assert.equal(later.series.from, "2026-11-16T09:29:45.000Z")
})

test("without an answer there is no page", () => {
  assert.equal(signalsPageOf(P04, []), null)
})
