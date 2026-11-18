import assert from "node:assert/strict"
import { test } from "node:test"

import { CARD_SIGNALS, SIGNAL_PATHS } from "@pleiades/cards/trulaser/contract.ts"
import type { Cockpit, Signal, SignalName, TrulaserTimeline } from "@pleiades/cards/trulaser/contract.ts"

import { trulaserAt, trulaserFilters, trulaserWith } from "./trulaser.ts"
import type { TrulaserLive } from "./trulaser.ts"

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
  status: { ...about, signals: signals(CARD_SIGNALS.status), sequence: null, activeAlerts: [] },
  jobOrder: { ...about, jobOrder: null, signals: signals(CARD_SIGNALS.jobOrder) },
  devices: { ...about, signals: signals(CARD_SIGNALS.devices), devices: [] },
  technology: { ...about, signals: signals(CARD_SIGNALS.technology) },
  collision: { ...about, signals: signals(CARD_SIGNALS.collision) },
  conditions: { ...about, tiles: [] },
}

const status = topic("umati/State/Status")
const itemState = topic(SIGNAL_PATHS.itemState.path)
const signalName = topic(SIGNAL_PATHS.changeCauseSignal.path)
const timeline: TrulaserTimeline = {
  machine: M,
  view: "status",
  from: at("09:00:00"),
  to: at("09:01:00"),
  lanes: [
    {
      key: "itemState",
      group: "State.Status",
      label: "MachineryItemState",
      topic: itemState,
      details: [{ name: "ChangeCause.SignalName", topic: signalName }],
      labelFrom: null,
      overlaps: false,
      spans: [
        { from: at("09:00:00"), to: at("09:01:00"), value: "Executing", label: null, details: [{ name: "ChangeCause.SignalName", value: "NcCycleActive" }] },
      ],
    },
  ],
  failures: [],
}
const live: TrulaserLive = { cockpit, timeline }

test("the page hears the state, the program execution, the alerts and job orders, and the extension", () => {
  assert.deepEqual(trulaserFilters(M), [
    `machines/${M}/oem/Dalle/#`,
    `machines/${M}/umati/State/Status`,
    `machines/${M}/umati/WorkMasterMonitoring/ProgramExecution`,
    `machines/${M}/events/notifications`,
    `machines/${M}/events/jobs`,
  ])
})

test("the snapshot State.Status takes its place in the card and starts a span, the ChangeCause is its detail", () => {
  const changed = trulaserWith(live, status, message(at("09:00:30"), { MachineryItemState: "NotExecuting", MachineryOperationMode: "Setup" }), NOW)
  assert.equal(changed.cockpit.status.signals.itemState.value, "NotExecuting")
  assert.equal(changed.cockpit.status.signals.operationMode.value, "Setup")
  const caused = trulaserWith(changed, signalName, message("2026-11-18T09:00:30.010Z", "PalletChange"), NOW)
  assert.deepEqual(caused.timeline?.lanes[0]?.spans.at(-1), {
    from: at("09:00:30"),
    to: at("09:01:00"),
    value: "NotExecuting",
    label: null,
    details: [{ name: "ChangeCause.SignalName", value: "PalletChange" }],
  })
})

const failure = { Id: "a1", ErrorCode: "DALLE-UNIT-PalletChange", Message: "Unit in malfunction: PalletChange", Severity: "Failure", SeverityValue: 800, SourceName: "PalletChange", Time: at("09:01:00") }

test("a raised Failure stands in the card and opens a lane and a stripe, its clear closes them", () => {
  let state = trulaserWith(live, topic("events/notifications"), event("Notification.AlertRaised", at("09:01:00"), failure), NOW)
  assert.deepEqual(state.cockpit.status.activeAlerts.map((one) => one.SourceName), ["PalletChange"])
  assert.equal(state.timeline?.lanes.at(-1)?.key, "alertsFailure")
  assert.deepEqual(state.timeline?.failures, [{ from: at("09:01:00"), to: at("09:01:00"), source: "PalletChange" }])
  state = trulaserAt(state, at("09:01:05"))
  assert.equal(state.timeline?.failures[0]?.to, at("09:01:05"))
  assert.equal(state.timeline?.lanes.at(-1)?.spans[0]?.to, at("09:01:05"))
  state = trulaserWith(state, topic("events/notifications"), event("Notification.AlertCleared", at("09:01:07"), failure), NOW)
  assert.deepEqual(state.cockpit.status.activeAlerts, [])
  assert.deepEqual(state.timeline?.failures, [{ from: at("09:01:00"), to: at("09:01:07"), source: "PalletChange" }])
  assert.equal(state.timeline?.lanes.at(-1)?.spans[0]?.to, at("09:01:07"))
})

test("a job order that starts becomes the one of the card, and its result counts the runs", () => {
  const entry = { JobOrderID: "cc7f", State: "Running", StateSince: at("09:00:10"), JobName: "ProductionPlanRun cc7f", WorkMasterID: "unknown" }
  let state = trulaserWith(live, topic("events/jobs"), event("JobMonitoring.JobOrderStarted", at("09:00:10"), entry), NOW)
  assert.equal(state.cockpit.jobOrder.jobOrder?.JobOrderID, "cc7f")
  assert.equal(state.cockpit.jobOrder.jobOrder?.StartTime, at("09:00:10"))
  state = trulaserWith(state, topic("events/jobs"), event("JobMonitoring.JobOrderChanged", at("09:00:11"), { ...entry, WorkMasterID: "PLL_SHEET_0001" }), NOW)
  assert.equal(state.cockpit.jobOrder.jobOrder?.WorkMasterID, "PLL_SHEET_0001")
  state = trulaserWith(state, topic("events/jobs"), event("JobMonitoring.JobOrderResultChanged", at("09:09:00"), { JobOrderID: "cc7f", RunsCompleted: 1, JobResult: "Unknown", EndTime: null }), NOW)
  assert.equal(state.cockpit.jobOrder.jobOrder?.RunsCompleted, 1)
  state = trulaserWith(state, topic("events/jobs"), event("JobMonitoring.JobOrderEnded", at("09:30:00"), { ...entry, State: "Ended", StateSince: at("09:30:00") }), NOW)
  assert.equal(state.cockpit.jobOrder.jobOrder?.State, "Ended")
  assert.equal(state.cockpit.jobOrder.jobOrder?.StartTime, at("09:00:10"))
})
