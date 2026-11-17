import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine, MachineList, MachineShow } from "@pleiades/cards/machine/contract.ts"

import { chartsAt, chartsWith, listAt, listWith, machineFilters, pageAt, pageWith, unknownMachine } from "./machines.ts"

const value = (timestamp: string, written: string | number) => JSON.stringify({ timestamp, value: written })
const event = (timestamp: string, action: string, level: string, correlationId: string) =>
  JSON.stringify({ timestamp, action, level, title: "Safety door open", notificationId: "4105", correlationId })

/** P-04, executing since 09:00, its newest sign of life at 09:29:50. */
function p04(): Machine {
  const machine = unknownMachine("P-04")
  const at = "2026-11-16T09:29:50.000Z"
  return {
    ...machine,
    connection: { ...machine.connection, value: "Connected", at, since: "2026-11-16T08:00:00.000Z" },
    itemState: { ...machine.itemState, value: "Executing", at, since: "2026-11-16T09:00:00.000Z" },
    operationMode: { ...machine.operationMode, value: "Processing", at, since: "2026-11-16T08:00:00.000Z" },
    lastValueAt: at,
  }
}

const list: MachineList = { asOf: "2026-11-16T09:30:00.000Z", windowSeconds: 1800, machines: [p04()] }

test("a page hears every reading and the notifications of a machine", () => {
  assert.deepEqual(machineFilters("P-04"), [
    "machines/P-04/umati/Connection/State",
    "machines/P-04/umati/Connection/Heartbeat",
    "machines/P-04/umati/State/MachineryItemState",
    "machines/P-04/umati/State/MachineryOperationMode",
    "machines/P-04/umati/Production/ActiveProgram",
    "machines/P-04/events/notifications",
  ])
})

test("the same value again goes on with its run; another one begins a run", () => {
  const same = listWith(list, "machines/P-04/umati/State/MachineryItemState", value("2026-11-16T09:30:05Z", "Executing"))
  assert.equal(same.machines[0]?.itemState.since, "2026-11-16T09:00:00.000Z")
  assert.equal(same.machines[0]?.itemState.at, "2026-11-16T09:30:05.000Z")
  assert.equal(same.machines[0]?.lastValueAt, "2026-11-16T09:30:05.000Z")

  const other = listWith(same, "machines/P-04/umati/State/MachineryItemState", value("2026-11-16T09:30:10Z", "Stopped"))
  assert.equal(other.machines[0]?.itemState.value, "Stopped")
  assert.equal(other.machines[0]?.itemState.since, "2026-11-16T09:30:10.000Z")
})

test("a run does not go on across a silence of the machine", () => {
  const after = listWith(list, "machines/P-04/umati/State/MachineryItemState", value("2026-11-16T09:31:00Z", "Executing"))
  assert.equal(after.machines[0]?.itemState.since, "2026-11-16T09:31:00.000Z")
})

test("a value the page knows already, or an older one, changes nothing", () => {
  const older = listWith(list, "machines/P-04/umati/State/MachineryItemState", value("2026-11-16T09:29:50Z", "Stopped"))
  assert.equal(older, list)
})

test("the heartbeat counts and is kept as text, as the backend keeps it", () => {
  const beat = listWith(list, "machines/P-04/umati/Connection/Heartbeat", value("2026-11-16T09:30:01Z", 25396))
  assert.equal(beat.machines[0]?.heartbeat.value, "25396")
})

test("a machine the list does not know yet joins it, in the order of the serial numbers", () => {
  const joined = listWith(list, "machines/M-02/umati/Connection/State", value("2026-11-16T09:30:01Z", "Connected"))
  assert.deepEqual(
    joined.machines.map((one) => one.machine),
    ["M-02", "P-04"],
  )
  const m02 = joined.machines[0]
  assert.equal(m02?.connection.value, "Connected")
  // Nothing is known of before: the value may have held already.
  assert.equal(m02?.connection.sinceIsLowerBound, true)
})

test("a message that is not a value of the binding names no machine", () => {
  assert.equal(listWith(list, "machines/X-1/umati/State/MachineryItemState", "not json"), list)
  assert.equal(listWith(list, "machines/X-1/umati/State/MachineryItemState", '{"timestamp":"2026-11-16T09:30:01Z","value":{"a":1}}'), list)
})

test("a value stamped far ahead of the clock of the server is left out", () => {
  const now = Date.parse("2026-11-16T09:30:00Z")
  const ahead = listWith(list, "machines/P-04/umati/State/MachineryItemState", value("2026-11-16T10:30:00Z", "Aborted"), now)
  assert.equal(ahead, list)
})

test("a warning that is raised stands until it is reset; a message of another level is not shown", () => {
  const topic = "machines/P-04/events/notifications"
  const raised = listWith(list, topic, event("2026-11-16T09:30:02Z", "Raised", "Warning", "c1"))
  assert.deepEqual(raised.machines[0]?.notifications, [
    {
      correlationId: "c1",
      notificationId: "4105",
      level: "Warning",
      title: "Safety door open",
      raisedAt: "2026-11-16T09:30:02.000Z",
      topic,
    },
  ])
  assert.equal(listWith(raised, topic, event("2026-11-16T09:30:02Z", "Raised", "Warning", "c1")), raised)
  assert.deepEqual(listWith(raised, topic, event("2026-11-16T09:31:00Z", "Reset", "Warning", "c1")).machines[0]?.notifications, [])
  assert.equal(listWith(list, topic, event("2026-11-16T09:30:02Z", "Raised", "Information", "c2")), list)
})

test("the clock of the list moves on, never back", () => {
  assert.equal(listAt(list, "2026-11-16T09:30:40.000Z").asOf, "2026-11-16T09:30:40.000Z")
  assert.equal(listAt(list, "2026-11-16T09:29:00.000Z"), list)
})

const show: MachineShow = {
  asOf: "2026-11-16T09:30:00.000Z",
  windowSeconds: 1800,
  machine: p04(),
  history: {
    from: "2026-11-16T01:30:00.000Z",
    to: "2026-11-16T09:30:00.000Z",
    totals: [
      { state: "running", seconds: 1800 },
      { state: "stopped", seconds: 27000 },
    ],
  },
}
const spans = [
  { state: "stopped" as const, from: "2026-11-16T01:30:00.000Z", to: "2026-11-16T09:00:00.000Z" },
  { state: "running" as const, from: "2026-11-16T09:00:00.000Z", to: "2026-11-16T09:30:00.000Z" },
]

test("the history rolls on with the state of now: the last span grows, and as much falls off at the beginning", () => {
  const later = pageAt({ show, spans }, "2026-11-16T09:30:10.000Z")
  assert.equal(later.show.asOf, "2026-11-16T09:30:10.000Z")
  assert.equal(later.show.history.to, "2026-11-16T09:30:10.000Z")
  assert.equal(later.show.history.from, "2026-11-16T01:30:10.000Z")
  assert.deepEqual(later.show.history.totals, [
    { state: "running", seconds: 1810 },
    { state: "stopped", seconds: 26990 },
  ])
  assert.deepEqual(later.spans, [
    { state: "stopped", from: "2026-11-16T01:30:10.000Z", to: "2026-11-16T09:00:00.000Z" },
    { state: "running", from: "2026-11-16T09:00:00.000Z", to: "2026-11-16T09:30:10.000Z" },
  ])
})

test("an open page keeps the length of its history: after eight hours, only what came after it", () => {
  const later = pageAt({ show, spans }, "2026-11-16T17:30:00.000Z")
  assert.equal(later.show.history.from, "2026-11-16T09:30:00.000Z")
  assert.deepEqual(later.spans, [{ state: "no-data", from: "2026-11-16T09:30:00.000Z", to: "2026-11-16T17:30:00.000Z" }])
  assert.deepEqual(later.show.history.totals, [{ state: "no-data", seconds: 28800 }])
})

test("a machine that falls silent begins a span without data", () => {
  // The newest sign of life is from 09:29:50: at 09:30:30 the machine has been silent for 40 seconds.
  const later = pageAt({ show, spans }, "2026-11-16T09:30:30.000Z")
  assert.deepEqual(later.spans?.at(-1), { state: "no-data", from: "2026-11-16T09:30:00.000Z", to: "2026-11-16T09:30:30.000Z" })
  assert.deepEqual(
    later.show.history.totals.find((one) => one.state === "no-data"),
    { state: "no-data", seconds: 30 },
  )
})

test("a card without its band does not know what falls off at the beginning: its history grows", () => {
  const later = pageAt({ show, spans: null }, "2026-11-16T09:30:10.000Z")
  assert.equal(later.spans, null)
  assert.equal(later.show.history.from, show.history.from)
  assert.equal(later.show.history.totals.find((one) => one.state === "running")?.seconds, 1810)
})

test("a band of the last minutes only does not know what falls off at the beginning: the history grows", () => {
  const recent = [{ state: "running" as const, from: "2026-11-16T09:00:00.000Z", to: "2026-11-16T09:30:00.000Z" }]
  const later = pageAt({ show, spans: recent }, "2026-11-16T09:30:10.000Z")
  assert.equal(later.show.history.from, show.history.from)
  assert.deepEqual(later.show.history.totals, [
    { state: "running", seconds: 1810 },
    { state: "stopped", seconds: 27000 },
  ])
  assert.deepEqual(later.spans, [{ state: "running", from: "2026-11-16T09:00:00.000Z", to: "2026-11-16T09:30:10.000Z" }])
})

test("the page Charts takes the values and the clock of each machine it shows, and no machine it does not", () => {
  const charts = { asOf: show.asOf, machines: [{ show, from: "2026-11-16T09:00:00.000Z", spans }] }
  const program = chartsWith(charts, "machines/P-04/umati/Production/ActiveProgram", value("2026-11-16T09:30:01Z", "WP-17"))
  assert.equal(program.machines[0]?.show.machine.program.value, "WP-17")
  assert.equal(chartsWith(charts, "machines/M-02/umati/Production/ActiveProgram", value("2026-11-16T09:30:01Z", "WP-17")), charts)

  const later = chartsAt(program, "2026-11-16T09:30:10.000Z")
  assert.equal(later.asOf, "2026-11-16T09:30:10.000Z")
  assert.equal(later.machines[0]?.show.history.to, "2026-11-16T09:30:10.000Z")
  assert.equal(later.machines[0]?.spans?.at(-1)?.to, "2026-11-16T09:30:10.000Z")
  assert.equal(chartsAt(later, "2026-11-16T09:30:05.000Z"), later)
})

test("a value of the machine reaches its card", () => {
  const page = pageWith({ show, spans }, "machines/P-04/umati/Production/ActiveProgram", value("2026-11-16T09:30:01Z", "WP-17"))
  assert.equal(page.show.machine.program.value, "WP-17")
  assert.equal(pageWith(page, "machines/P-04/umati/State/Unknown", value("2026-11-16T09:30:01Z", "x")), page)
})
