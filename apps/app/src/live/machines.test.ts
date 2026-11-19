import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine, MachineList, MachineShow } from "@pleiades/cards/machine/contract.ts"

import {
  chartsAt,
  chartsWith,
  listAt,
  listWith,
  machineFilters,
  pageAt,
  pageWith,
  unknownMachine,
} from "./machines.ts"

const P04 = "alcyone-machines_AX-400_P-04"
const M02 = "merope-microtec_MM-120_M-02"
const base = `machines/${P04}`
/** The clock of the server in these tests: after every value they send, so none is stamped ahead of it. */
const NOW = Date.parse("2026-11-16T09:32:00Z")

const value = (timestamp: string, written: unknown) => JSON.stringify({ timestamp, value: written })
const status = (timestamp: string, itemState: string, operationMode = "Processing") =>
  value(timestamp, { MachineryItemState: itemState, MachineryOperationMode: operationMode })
const alert = (time: string, action: "Raised" | "Changed" | "Cleared", severity: string, id: string, since = time) =>
  JSON.stringify({
    specversion: "1.0",
    id: `${id}-${action}`,
    source: "https://www.alcyone-machines.example/AX-400/P-04",
    type: `Notification.Alert${action}`,
    time,
    data: { Id: id, ErrorCode: "4105", Message: "Safety door open", Severity: severity, SeverityValue: 500, Time: since },
  })

/** P-04, executing since 09:00, its newest sign of life at 09:29:50. */
function p04(): Machine {
  const machine = unknownMachine(P04)
  const at = "2026-11-16T09:29:50.000Z"
  return {
    ...machine,
    identity: { manufacturer: "Alcyone Machine Works", model: "AX-400", serialNumber: "P-04" },
    connection: { ...machine.connection, value: "Running", at, since: "2026-11-16T08:00:00.000Z" },
    itemState: { ...machine.itemState, value: "Executing", at, since: "2026-11-16T09:00:00.000Z" },
    operationMode: { ...machine.operationMode, value: "Processing", at, since: "2026-11-16T08:00:00.000Z" },
    lastValueAt: at,
  }
}

const list: MachineList = { asOf: "2026-11-16T09:30:00.000Z", windowSeconds: 1800, machines: [p04()] }

test("a page hears the readings where the broker carries them, the alerts, the identification and the job orders", () => {
  assert.deepEqual(machineFilters(P04), [
    `${base}/umati/Connection/State`,
    `${base}/umati/Connection/Heartbeat`,
    // The state and the operation mode are the two fields of one snapshot: one topic. An adapter
    // that sends no snapshot publishes them one by one.
    `${base}/umati/State/Status`,
    `${base}/umati/State/Status/MachineryItemState`,
    `${base}/umati/State/Status/MachineryOperationMode`,
    `${base}/umati/WorkMasterMonitoring/ActiveWorkMaster`,
    `${base}/events/notifications`,
    `${base}/umati/Identification/Manufacturer`,
    `${base}/umati/Identification/Model`,
    `${base}/umati/Identification/SerialNumber`,
    `${base}/umati/Identification/DeviceClass`,
    `${base}/umati/JobMonitoring/JobOrders`,
    `${base}/umati/JobMonitoring/JobOrderResults`,
  ])
  assert.ok(machineFilters().includes("machines/+/umati/State/Status"))
})

test("a reading names the topic the store keeps it on, as the backend names it", () => {
  const machine = unknownMachine(P04)
  assert.equal(machine.itemState.topic, `${base}/umati/State/Status/MachineryItemState`)
  assert.equal(machine.operationMode.topic, `${base}/umati/State/Status/MachineryOperationMode`)
  assert.equal(machine.program.topic, `${base}/umati/WorkMasterMonitoring/ActiveWorkMaster`)
})

test("the same state again goes on with its run; another one begins a run", () => {
  const same = listWith(list, `${base}/umati/State/Status`, status("2026-11-16T09:30:05Z", "Executing"), NOW)
  assert.equal(same.machines[0]?.itemState.since, "2026-11-16T09:00:00.000Z")
  assert.equal(same.machines[0]?.itemState.at, "2026-11-16T09:30:05.000Z")
  assert.equal(same.machines[0]?.lastValueAt, "2026-11-16T09:30:05.000Z")

  const other = listWith(same, `${base}/umati/State/Status`, status("2026-11-16T09:30:10Z", "NotExecuting"), NOW)
  assert.equal(other.machines[0]?.itemState.value, "NotExecuting")
  assert.equal(other.machines[0]?.itemState.since, "2026-11-16T09:30:10.000Z")
})

test("a field an adapter publishes on its own, without a snapshot, is the same reading", () => {
  const topic = `${base}/umati/State/Status/MachineryItemState`
  const idle = listWith(list, topic, value("2026-11-16T09:30:05Z", "NotExecuting"), NOW)
  assert.equal(idle.machines[0]?.itemState.value, "NotExecuting")
  assert.equal(idle.machines[0]?.operationMode.value, "Processing")
})

test("a snapshot sets both of its readings at once", () => {
  const setup = listWith(list, `${base}/umati/State/Status`, status("2026-11-16T09:30:05Z", "NotExecuting", "Setup"), NOW)
  assert.equal(setup.machines[0]?.itemState.value, "NotExecuting")
  assert.equal(setup.machines[0]?.operationMode.value, "Setup")
  assert.equal(setup.machines[0]?.operationMode.since, "2026-11-16T09:30:05.000Z")
})

test("a run does not go on across a silence of the machine", () => {
  const after = listWith(list, `${base}/umati/State/Status`, status("2026-11-16T09:31:00Z", "Executing"), NOW)
  assert.equal(after.machines[0]?.itemState.since, "2026-11-16T09:31:00.000Z")
})

test("a value the page knows already, or an older one, changes nothing: the retained values at the subscription", () => {
  const older = listWith(list, `${base}/umati/State/Status`, status("2026-11-16T09:29:50Z", "NotExecuting"), NOW)
  assert.equal(older, list)
})

test("the heartbeat counts and is kept as text, as the backend keeps it", () => {
  const beat = listWith(list, `${base}/umati/Connection/Heartbeat`, value("2026-11-16T09:30:01Z", 25396), NOW)
  assert.equal(beat.machines[0]?.heartbeat.value, "25396")
})

test("a work master that is not there right now, null, leaves the last one known, as the store keeps none", () => {
  const master = listWith(list, `${base}/umati/WorkMasterMonitoring/ActiveWorkMaster`, value("2026-11-16T09:30:01Z", "WM-SHAFT-4711"), NOW)
  assert.equal(master.machines[0]?.program.value, "WM-SHAFT-4711")
  assert.equal(listWith(master, `${base}/umati/WorkMasterMonitoring/ActiveWorkMaster`, value("2026-11-16T09:30:02Z", null), NOW), master)
})

test("a machine the list does not know yet joins it with its first sign of life, in the order of the machine ids", () => {
  const joined = listWith(list, `machines/${M02}/umati/Connection/State`, value("2026-11-16T09:30:01Z", "Initializing"), NOW)
  assert.deepEqual(
    joined.machines.map((one) => one.machine),
    [P04, M02],
  )
  const m02 = joined.machines[1]
  assert.equal(m02?.connection.value, "Initializing")
  // Nothing is known of before: the value may have held already.
  assert.equal(m02?.connection.sinceIsLowerBound, true)
  assert.deepEqual(m02?.identity, { manufacturer: null, model: null, serialNumber: null })

  // Its identification follows: the adapter publishes every value after `Initializing`.
  const named = listWith(joined, `machines/${M02}/umati/Identification/Model`, value("2026-11-16T09:30:01Z", "MM-120"), NOW)
  assert.equal(named.machines[1]?.identity.model, "MM-120")
  assert.equal(listWith(named, `machines/${M02}/umati/Identification/Model`, value("2026-11-16T09:30:01Z", "MM-120"), NOW), named)
})

test("the retained values of a machine that is long gone name no machine, and neither does who it is", () => {
  // The last will of an adapter that left two days ago still stands at the broker.
  const gone = listWith(list, `machines/${M02}/umati/Connection/State`, value("2026-11-14T09:00:00Z", "CommunicationFault"), NOW)
  assert.equal(gone, list)
  assert.equal(listWith(list, `machines/${M02}/umati/Identification/Model`, value("2026-11-16T09:30:01Z", "MM-120"), NOW), list)
  assert.equal(listWith(list, `machines/${M02}/umati/JobMonitoring/JobOrders`, value("2026-11-16T09:30:01Z", []), NOW), list)
})

test("a message that is not a value of the binding names no machine", () => {
  assert.equal(listWith(list, "machines/x_y_z/umati/State/Status", "not json", NOW), list)
  assert.equal(listWith(list, "machines/x_y_z/umati/State/Status", '{"timestamp":"2026-11-16T09:30:01Z","value":{"a":1}}', NOW), list)
  assert.equal(listWith(list, "machines/x_y_z/umati/Manifest", '{"machineId":"x_y_z"}', NOW), list)
})

test("a value stamped far ahead of the clock of the server is left out", () => {
  const ahead = listWith(list, `${base}/umati/State/Status`, status("2026-11-16T10:30:00Z", "NotExecuting"), NOW)
  assert.equal(ahead, list)
})

test("an alert that is raised stands until it is cleared, with the category of NE 107", () => {
  const topic = `${base}/events/notifications`
  const raised = listWith(list, topic, alert("2026-11-16T09:30:02Z", "Raised", "OffSpec", "a1"), NOW)
  assert.deepEqual(raised.machines[0]?.notifications, [
    {
      correlationId: "a1",
      notificationId: "4105",
      severity: "OffSpec",
      level: "Warning",
      title: "Safety door open",
      raisedAt: "2026-11-16T09:30:02.000Z",
      topic,
    },
  ])
  // The same event again, as QoS 1 may deliver it, changes nothing.
  assert.equal(listWith(raised, topic, alert("2026-11-16T09:30:02Z", "Raised", "OffSpec", "a1"), NOW), raised)
  assert.deepEqual(listWith(raised, topic, alert("2026-11-16T09:31:00Z", "Cleared", "OffSpec", "a1", "2026-11-16T09:30:02Z"), NOW).machines[0]?.notifications, [])
  // A clear of an alert the page never saw changes nothing.
  assert.equal(listWith(list, topic, alert("2026-11-16T09:31:00Z", "Cleared", "OffSpec", "a9"), NOW), list)
})

test("a failure is an error, and an alert that changes keeps since when it stands", () => {
  const topic = `${base}/events/notifications`
  const raised = listWith(list, topic, alert("2026-11-16T09:30:02Z", "Raised", "OffSpec", "a1"), NOW)
  const changed = listWith(raised, topic, alert("2026-11-16T09:30:20Z", "Changed", "Failure", "a1", "2026-11-16T09:30:02Z"), NOW)
  assert.equal(changed.machines[0]?.notifications.length, 1)
  assert.equal(changed.machines[0]?.notifications[0]?.level, "Error")
  assert.equal(changed.machines[0]?.notifications[0]?.severity, "Failure")
  assert.equal(changed.machines[0]?.notifications[0]?.raisedAt, "2026-11-16T09:30:02.000Z")
})

test("a message that does not stay is no alert of the card", () => {
  const topic = `${base}/events/notifications`
  const note = JSON.stringify({
    specversion: "1.0",
    type: "Notification.NotificationEvent",
    time: "2026-11-16T09:30:02Z",
    data: { Id: "n1", ErrorCode: "M0", Message: "Programmed stop" },
  })
  assert.equal(listWith(list, topic, note, NOW), list)
})

test("the job order that runs comes from the list of job orders, what it produced from the list of results", () => {
  const orders = `${base}/umati/JobMonitoring/JobOrders`
  const results = `${base}/umati/JobMonitoring/JobOrderResults`
  const entries = [
    { JobOrderID: "4711/01", State: "Ended", StateSince: "2026-11-16T09:10:00Z", RunsPlanned: 4 },
    { JobOrderID: "4711/02", State: "Running", StateSince: "2026-11-16T09:20:00Z", RunsPlanned: 12 },
    { JobOrderID: "4711/03", State: "AllowedToStart", StateSince: "2026-11-16T09:00:00Z", RunsPlanned: 6 },
  ]
  const running = listWith(list, orders, value("2026-11-16T09:30:01Z", entries), NOW)
  // A job order that runs has a result from its start, with nothing produced yet.
  assert.deepEqual(running.machines[0]?.jobOrder, { jobOrderId: "4711/02", state: "Running", producedQuantity: 0, runsPlanned: 12 })

  const produced = listWith(running, results, value("2026-11-16T09:30:05Z", [{ JobOrderID: "4711/02", ProducedQuantity: 3 }]), NOW)
  assert.equal(produced.machines[0]?.jobOrder?.producedQuantity, 3)
  // The same lists again, as they arrive retained at a subscription, change nothing.
  assert.equal(listWith(produced, results, value("2026-11-16T09:30:05Z", [{ JobOrderID: "4711/02", ProducedQuantity: 3 }]), NOW), produced)

  const interrupted = entries.map((entry) => (entry.JobOrderID === "4711/02" ? { ...entry, State: "Interrupted" } : entry))
  const stopped = listWith(produced, orders, value("2026-11-16T09:30:10Z", interrupted), NOW)
  assert.deepEqual(stopped.machines[0]?.jobOrder, { jobOrderId: "4711/02", state: "Interrupted", producedQuantity: 3, runsPlanned: 12 })

  const ended = entries.map((entry) => (entry.JobOrderID === "4711/02" ? { ...entry, State: "Ended" } : entry))
  assert.equal(listWith(stopped, orders, value("2026-11-16T09:31:00Z", ended), NOW).machines[0]?.jobOrder, null)
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
  const program = chartsWith(charts, `${base}/umati/WorkMasterMonitoring/ActiveWorkMaster`, value("2026-11-16T09:30:01Z", "WM-17"), NOW)
  assert.equal(program.machines[0]?.show.machine.program.value, "WM-17")
  assert.equal(chartsWith(charts, `machines/${M02}/umati/WorkMasterMonitoring/ActiveWorkMaster`, value("2026-11-16T09:30:01Z", "WM-17"), NOW), charts)

  const later = chartsAt(program, "2026-11-16T09:30:10.000Z")
  assert.equal(later.asOf, "2026-11-16T09:30:10.000Z")
  assert.equal(later.machines[0]?.show.history.to, "2026-11-16T09:30:10.000Z")
  assert.equal(later.machines[0]?.spans?.at(-1)?.to, "2026-11-16T09:30:10.000Z")
  assert.equal(chartsAt(later, "2026-11-16T09:30:05.000Z"), later)
})

test("a value of the machine reaches its card", () => {
  const page = pageWith({ show, spans }, `${base}/umati/WorkMasterMonitoring/ActiveWorkMaster`, value("2026-11-16T09:30:01Z", "WM-17"), NOW)
  assert.equal(page.show.machine.program.value, "WM-17")
  assert.equal(pageWith(page, `${base}/umati/State/Unknown`, value("2026-11-16T09:30:01Z", "x"), NOW), page)
})
