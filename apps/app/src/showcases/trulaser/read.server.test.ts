import assert from "node:assert/strict"
import { test } from "node:test"

import type { AlertSpan, JobOrderEntry } from "./apis.server.ts"
import { activeAlertsOf, alertEnd, alertLanes, currentJobOrder, jobOrderLane, laneSpans, oldestRaise, thinnedLane } from "./read.server.ts"

const at = (clock: string) => `2026-11-18T${clock}.000Z`
const ms = (clock: string) => Date.parse(at(clock))
const span = (from: string, to: string, value: string | null) => ({ from: at(from), to: at(to), value, label: null, details: [] })

test("a value holds until the next one, and the value before the hours holds where they begin", () => {
  const samples = [
    { at: at("08:50:00"), value: "NotExecuting" },
    { at: at("09:00:10"), value: "Executing" },
    { at: at("09:00:20"), value: "Executing" },
    { at: at("09:00:30"), value: "NotExecuting" },
  ]
  assert.deepEqual(laneSpans(samples, at("09:00:00"), at("09:01:00")), [
    span("09:00:00", "09:00:10", "NotExecuting"),
    span("09:00:10", "09:00:30", "Executing"),
    span("09:00:30", "09:01:00", "NotExecuting"),
  ])
})

test("a span of a ProgramExecution carries the fields that held when it began, and is called by its work master", () => {
  const states = [
    { at: at("09:00:10"), value: "Running" },
    { at: at("09:00:40"), value: "Ended" },
  ]
  // The fields of the snapshot come with the state, at the same instant or a few milliseconds later.
  const workMasters = [
    { at: at("08:59:00"), value: "PLL_SHEET_0001" },
    { at: "2026-11-18T09:00:10.020Z", value: "PLL_SHEET_0002" },
  ]
  const spans = laneSpans(states, at("09:00:00"), at("09:01:00"), [{ name: "ActiveWorkMaster", samples: workMasters }], "ActiveWorkMaster")
  assert.deepEqual(
    spans.map((one) => [one.value, one.label]),
    [
      [null, "PLL_SHEET_0001"],
      ["Running", "PLL_SHEET_0002"],
      ["Ended", "PLL_SHEET_0002"],
    ],
  )
})

const alert = (raised: string, cleared: string | null, severity: AlertSpan["severity"], source: string): AlertSpan => ({
  alertId: `${source}-${raised}`,
  errorCode: `E-${source}`,
  message: source,
  severity,
  severityValue: 800,
  sourceName: source,
  raisedAt: at(raised),
  clearedAt: cleared === null ? null : at(cleared),
})

test("an alert that was never cleared ends where the adapter started again", () => {
  const starts = [ms("09:30:00")]
  assert.equal(alertEnd(alert("09:00:00", null, "OffSpec", "Machine"), starts, ms("10:00:00")), ms("09:30:00"))
  assert.equal(alertEnd(alert("09:40:00", null, "OffSpec", "Machine"), starts, ms("10:00:00")), ms("10:00:00"))
  assert.equal(alertEnd(alert("09:40:00", "09:41:00", "Failure", "PalletChange"), starts, ms("10:00:00")), ms("09:41:00"))
})

test("the active alerts are those that stand since the adapter started, a Failure first", () => {
  const alerts = [
    alert("09:00:00", null, "OffSpec", "Machine"),
    alert("09:40:00", null, "OffSpec", "Machine"),
    alert("09:45:00", null, "Failure", "PalletChange"),
    alert("09:41:00", "09:42:00", "Failure", "NcCycleActive"),
  ]
  assert.deepEqual(
    activeAlertsOf(alerts, [ms("09:30:00")], ms("10:00:00")).map((one) => [one.Severity, one.SourceName]),
    [
      ["Failure", "PalletChange"],
      ["OffSpec", "Machine"],
    ],
  )
})

test("the starts of the adapter are read back to the oldest alert that may still stand", () => {
  // Raised 40 hours before, never cleared: the starts since then decide whether it stands.
  const old = alert("09:00:00", null, "OffSpec", "Machine")
  const from = new Date(ms("09:00:00") + 40 * 3_600_000)
  assert.equal(oldestRaise([old], from).toISOString(), at("09:00:00"))
  assert.equal(oldestRaise([], from).getTime(), from.getTime())
})

test("the alerts make one lane for each category, in the order of NE 107", () => {
  const lanes = alertLanes(
    [alert("09:10:00", "09:12:00", "OffSpec", "Machine"), alert("09:20:00", "09:21:30", "Failure", "PalletChange")],
    [],
    ms("09:00:00"),
    ms("10:00:00"),
    "events",
  )
  assert.deepEqual(
    lanes.map((one) => [one.key, one.group, one.spans.map((each) => [each.label, each.from, each.to])]),
    [
      ["alertsFailure", "Notification.ActiveAlerts", [["PalletChange", at("09:20:00"), at("09:21:30")]]],
      ["alertsOffSpec", null, [["Machine", at("09:10:00"), at("09:12:00")]]],
    ],
  )
  // Each span carries the id of its alert, so a clear that comes live closes it.
  assert.ok(lanes[0]?.spans[0]?.details.some((one) => one.name === "AlertId" && one.value === "PalletChange-09:20:00"))
})

const job = (id: string, state: string, start: string | null, end: string | null): JobOrderEntry => ({
  jobOrderId: id,
  state,
  lastChange: at(end ?? start ?? "09:00:00"),
  removed: false,
  jobName: `ProductionPlanRun ${id}`,
  workMasterId: "PLL_SHEET_0001",
  startTime: start && at(start),
  endTime: end && at(end),
  runsCompleted: 2,
  jobResult: end ? "Successful" : "Unknown",
})

test("the job order of the card is the one that runs, else the newest that ended", () => {
  assert.equal(currentJobOrder([job("b", "Ended", "09:30:00", "09:40:00"), job("a", "Running", "09:00:00", null)], [])?.jobOrderId, "a")
  assert.equal(currentJobOrder([job("b", "Ended", "09:30:00", "09:40:00")], [])?.jobOrderId, "b")
  assert.equal(currentJobOrder([], []), null)
})

test("a job order the machine removed from its list is not its job order", () => {
  const removed = { ...job("a", "Running", "09:00:00", null), removed: true }
  assert.equal(currentJobOrder([removed, job("z", "Ended", "08:00:00", "08:30:00")], [])?.jobOrderId, "z")
})

test("a job order left open by an earlier run of the adapter is over", () => {
  // The adapter started again at 09:30; job order a never got its end.
  const entries = [job("a", "Running", "09:00:00", null), job("z", "Ended", "08:00:00", "08:30:00")]
  assert.equal(currentJobOrder(entries, [ms("09:30:00")])?.jobOrderId, "z")
  const lane = jobOrderLane(entries, [ms("09:30:00")], ms("09:00:00"), ms("10:00:00"), "events")
  assert.deepEqual(lane.spans.map((one) => [one.label, one.value, one.to]), [["a", "Running", at("09:30:00")]])
})

test("the job orders become spans from their start to their end, each called by its id", () => {
  const lane = jobOrderLane([job("a", "Ended", "08:50:00", "09:20:00"), job("b", "Running", "09:21:00", null)], [], ms("09:00:00"), ms("10:00:00"), "events")
  assert.deepEqual(
    lane.spans.map((one) => [one.label, one.value, one.from, one.to]),
    [
      ["a", "Running", at("09:00:00"), at("09:20:00")],
      ["b", "Running", at("09:21:00"), at("10:00:00")],
    ],
  )
})

test("a lane with more spans than slots shows in each slot the value that lasted longest", () => {
  const spans = [
    span("09:00:00", "09:00:08", "A"),
    span("09:00:08", "09:00:10", "B"),
    span("09:00:10", "09:00:12", "B"),
    span("09:00:12", "09:00:20", "C"),
  ]
  assert.deepEqual(thinnedLane(spans, 2), [span("09:00:00", "09:00:10", "A"), span("09:00:10", "09:00:20", "C")])
  assert.deepEqual(thinnedLane(spans, 4), spans)
})
