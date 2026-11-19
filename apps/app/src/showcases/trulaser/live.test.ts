import assert from "node:assert/strict"
import { test } from "node:test"

import { CARD_SIGNALS, SIGNAL_PATHS } from "./contract.ts"
import type { Cockpit, Signal, SignalName, TrulaserTimeline } from "./contract.ts"

import { cockpitMessage, timelineAt, timelineMessage, trulaserFilters } from "./live.ts"
import type { TimelineLive } from "./live.ts"

const M = "trumpf_PLL01_L1649A-STARLINER"
const topic = (path: string) => `machines/${M}/${path}`
const at = (clock: string) => `2026-11-18T${clock}.000Z`
const message = (timestamp: string, value: unknown) => JSON.stringify({ timestamp, value })
const event = (type: string, time: string, data: Record<string, unknown>) =>
  JSON.stringify({ specversion: "1.0", id: "x", source: "s", type, time, data })
/** The clock of the server in these tests: after every value they send. */
const NOW = Date.parse(at("10:00:00"))

const signal = (path: string, value: Signal["value"] = null, unit: string | null = null): Signal => ({
  value,
  unit,
  at: value === null ? null : at("09:00:00"),
  topic: topic(path),
})
const signals = <TNames extends ReadonlyArray<SignalName>>(names: TNames) =>
  Object.fromEntries(names.map((name) => [name, signal(SIGNAL_PATHS[name].path)])) as { [K in TNames[number]]: Signal }

const about = { asOf: at("09:00:00"), machine: M, serialNumber: "L1649A-STARLINER" }
const cockpit: Cockpit = {
  status: { ...about, signals: signals(CARD_SIGNALS.status), activeAlerts: [], alertsComplete: true },
  jobOrder: { ...about, jobOrder: null, signals: signals(CARD_SIGNALS.jobOrder) },
  devices: { ...about, signals: signals(CARD_SIGNALS.devices), devices: [] },
  technology: { ...about, signals: signals(CARD_SIGNALS.technology) },
  collision: { ...about, signals: signals(CARD_SIGNALS.collision) },
  conditions: { ...about, tiles: [] },
}

const status = topic("umati/State/Status")
const connection = topic("umati/Connection/State")
const notifications = topic("events/notifications")
const itemState = topic(SIGNAL_PATHS.itemState.path)
const operationMode = topic(SIGNAL_PATHS.operationMode.path)
const signalName = topic(SIGNAL_PATHS.changeCauseSignal.path)
const cause = (value: string | null) => [{ name: "ChangeCause.SignalName", value }]
const lane = (key: string, label: string, laneTopic: string, value: string, from: string) => ({
  key,
  group: null,
  label,
  topic: laneTopic,
  details: [{ name: "ChangeCause.SignalName", topic: signalName }],
  labelFrom: null,
  overlaps: false,
  spans: [{ from: at(from), to: at("09:01:00"), value, label: null, details: cause("NcCycleActive") }],
})
const timeline: TrulaserTimeline = {
  machine: M,
  view: "status",
  from: at("07:00:00"),
  to: at("09:01:00"),
  lanes: [lane("itemState", "MachineryItemState", itemState, "Executing", "09:00:00"), lane("operationMode", "MachineryOperationMode", operationMode, "Processing", "07:00:00")],
  failures: [],
  alertsComplete: true,
}
const history: TimelineLive = { timeline, recent: {} }

test("the page hears the state, the program execution, the adapter, the alerts and job orders, and the extension", () => {
  assert.deepEqual(trulaserFilters(M), [
    `machines/${M}/oem/Dalle/#`,
    `machines/${M}/umati/State/Status`,
    `machines/${M}/umati/WorkMasterMonitoring/ProgramExecution`,
    `machines/${M}/umati/Connection/State`,
    `machines/${M}/events/notifications`,
    `machines/${M}/events/jobs`,
  ])
})

test("the snapshot State.Status takes its place in the card", () => {
  const changed = cockpitMessage(cockpit, status, message(at("09:00:30"), { MachineryItemState: "NotExecuting", MachineryOperationMode: "Setup" }), NOW)
  assert.equal(changed.status.signals.itemState.value, "NotExecuting")
  assert.equal(changed.status.signals.operationMode.value, "Setup")
})

test("a new state starts a span with the ChangeCause that came with it, before or just after", () => {
  // The cause a few milliseconds before the snapshot.
  let state = timelineMessage(history, signalName, message("2026-11-18T09:00:29.995Z", "PalletChange"), NOW)
  state = timelineMessage(state, status, message(at("09:00:30"), { MachineryItemState: "NotExecuting" }), NOW)
  assert.deepEqual(state.timeline.lanes[0]?.spans.at(-1)?.details, cause("PalletChange"))
  // The span before keeps its cause.
  assert.deepEqual(state.timeline.lanes[0]?.spans[0]?.details, cause("NcCycleActive"))
  // A cause just after the snapshot is the one of the new span.
  state = timelineMessage(state, signalName, message("2026-11-18T09:00:30.010Z", "HomingCycle"), NOW)
  assert.deepEqual(state.timeline.lanes[0]?.spans.at(-1)?.details, cause("HomingCycle"))
})

test("a later ChangeCause rewrites no span that began long before", () => {
  // The OperationMode span began at 07:00; a cause at 09:00:30 belongs to another change.
  const state = timelineMessage(history, signalName, message(at("09:00:30"), "PalletChange"), NOW)
  assert.deepEqual(state.timeline.lanes[1]?.spans[0]?.details, cause("NcCycleActive"))
})

const failure = { Id: "a1", ErrorCode: "DALLE-UNIT-PalletChange", Message: "Unit in malfunction: PalletChange", Severity: "Failure", SeverityValue: 800, SourceName: "PalletChange", Time: at("09:01:00") }

test("a raised Failure stands in the card and opens a lane and a stripe, its clear closes them", () => {
  const raised = event("Notification.AlertRaised", at("09:01:00"), failure)
  const cards = cockpitMessage(cockpit, notifications, raised, NOW)
  assert.deepEqual(cards.status.activeAlerts.map((one) => one.SourceName), ["PalletChange"])
  let state = timelineMessage(history, notifications, raised, NOW)
  assert.equal(state.timeline.lanes.at(-1)?.key, "alertsFailure")
  assert.deepEqual(state.timeline.failures, [{ from: at("09:01:00"), to: at("09:01:00"), source: "PalletChange" }])
  state = timelineAt(state, at("09:01:05"))
  assert.equal(state.timeline.failures[0]?.to, at("09:01:05"))
  const cleared = event("Notification.AlertCleared", at("09:01:07"), failure)
  assert.deepEqual(cockpitMessage(cards, notifications, cleared, NOW).status.activeAlerts, [])
  state = timelineMessage(state, notifications, cleared, NOW)
  assert.deepEqual(state.timeline.failures, [{ from: at("09:01:00"), to: at("09:01:07"), source: "PalletChange" }])
  assert.equal(state.timeline.lanes.at(-1)?.spans[0]?.to, at("09:01:07"))
})

test("a NotificationEvent is no alert: it never stands", () => {
  const note = event("Notification.NotificationEvent", at("09:01:00"), { Id: "n1", ErrorCode: "Stop", Message: "Program stopped", SourceName: "Machine" })
  assert.deepEqual(cockpitMessage(cockpit, notifications, note, NOW).status.activeAlerts, [])
  assert.deepEqual(timelineMessage(history, notifications, note, NOW), history)
})

test("a start of the adapter ends the alerts and the open job order of the run before", () => {
  let cards = cockpitMessage(cockpit, notifications, event("Notification.AlertRaised", at("09:01:00"), failure), NOW)
  cards = cockpitMessage(cards, topic("events/jobs"), event("JobMonitoring.JobOrderStarted", at("09:00:10"), { JobOrderID: "a", State: "Running", StateSince: at("09:00:10") }), NOW)
  cards = cockpitMessage(cards, connection, message(at("09:02:00"), "Initializing"), NOW)
  assert.deepEqual(cards.status.activeAlerts, [])
  assert.equal(cards.jobOrder.jobOrder, null)
  let state = timelineMessage(history, notifications, event("Notification.AlertRaised", at("09:01:00"), failure), NOW)
  // The clock of the page moves on each second; the adapter starts again in between.
  state = timelineAt(state, at("09:01:20"))
  state = timelineMessage(state, connection, message(at("09:01:10"), "Initializing"), NOW)
  state = timelineAt(state, at("09:05:00"))
  assert.equal(state.timeline.failures[0]?.to, at("09:01:10"))
  assert.equal(state.timeline.lanes.at(-1)?.spans[0]?.to, at("09:01:10"))
})

test("a job order that starts becomes the one of the card, and its result counts the runs", () => {
  const jobs = topic("events/jobs")
  const entry = { JobOrderID: "cc7f", State: "Running", StateSince: at("09:00:10"), JobName: "ProductionPlanRun cc7f", WorkMasterID: "unknown" }
  let cards = cockpitMessage(cockpit, jobs, event("JobMonitoring.JobOrderStarted", at("09:00:10"), entry), NOW)
  assert.equal(cards.jobOrder.jobOrder?.JobOrderID, "cc7f")
  cards = cockpitMessage(cards, jobs, event("JobMonitoring.JobOrderResultChanged", at("09:09:00"), { JobOrderID: "cc7f", RunsCompleted: 1, JobResult: "Unknown", EndTime: null }), NOW)
  assert.equal(cards.jobOrder.jobOrder?.RunsCompleted, 1)
  assert.equal(cards.jobOrder.jobOrder?.StateSince, at("09:00:10"))
  cards = cockpitMessage(cards, jobs, event("JobMonitoring.JobOrderEnded", at("09:30:00"), { ...entry, State: "Ended", StateSince: "no time" }), NOW)
  assert.equal(cards.jobOrder.jobOrder?.State, "Ended")
  // A StateSince that is no time is not kept: the time of the event stands for it.
  assert.equal(cards.jobOrder.jobOrder?.StateSince, at("09:30:00"))
})
