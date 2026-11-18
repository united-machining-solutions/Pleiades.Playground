import assert from "node:assert/strict"
import { test } from "node:test"

import type { Signal, TrulaserDevices, TrulaserJobOrder, TrulaserStatus } from "./contract.ts"
import { shownNumber, tileValue, trulaserDevicesInWords, trulaserJobOrderInWords, trulaserStatusInWords, trulaserTitle } from "./words.ts"

test("a display writes a fraction as percent and a pressure in pascal as millibar", () => {
  assert.deepEqual(shownNumber(0.85, "one", "percent"), { number: "85.0", unit: "%" })
  assert.deepEqual(shownNumber(513000, "pascal", "millibar"), { number: "5130.0", unit: "mbar" })
  assert.deepEqual(shownNumber(18, "one", "microsiemens"), { number: "18.0", unit: "µS" })
  // A value in another unit than expected keeps its own.
  assert.deepEqual(shownNumber(5, "bar", "millibar"), { number: "5", unit: "bar" })
})

const signal = (value: Signal["value"]): Signal => ({ value, unit: null, at: null, topic: "t" })
const about = { asOf: "2026-11-18T10:00:00.000Z", machine: "trumpf_PLL01_L1649A-STARLINER", serialNumber: "L1649A-STARLINER" }

test("a tile without a value shows a dash", () => {
  assert.equal(tileValue({ value: signal(null), shown: "percent" }), "–")
  assert.equal(tileValue({ value: { ...signal(0.5), unit: "one" }, shown: "percent" }), "50.0 %")
})

test("State.Status in words names the state, the ChangeCause and the ActiveAlerts", () => {
  const status: TrulaserStatus = {
    ...about,
    signals: {
      manufacturer: signal("TRUMPF"),
      model: signal("PLL01"),
      itemState: signal("OutOfService"),
      operationMode: signal("Setup"),
      changeCauseSignal: signal("PalletChange"),
      changeCauseValue: signal("SequenceStateAndBlockingCause { SequenceState = Active, BlockingCause = InternalMalfunction }"),
    },
    sequence: { sequenceState: "Active", blockingCause: "InternalMalfunction" },
    activeAlerts: [
      {
        Id: "a1",
        ErrorCode: "DALLE-UNIT-PalletChange",
        Message: "Unit in malfunction: PalletChange",
        Severity: "Failure",
        SeverityValue: 800,
        SourceName: "PalletChange",
        Time: "2026-11-18T09:59:00.000Z",
      },
    ],
  }
  assert.equal(trulaserTitle(status), "TruLaser L1649A-STARLINER")
  assert.equal(
    trulaserStatusInWords(status),
    [
      "TruLaser L1649A-STARLINER (trumpf_PLL01_L1649A-STARLINER, Model PLL01): State.Status MachineryItemState OutOfService, MachineryOperationMode Setup.",
      "ChangeCause (extension): SignalName PalletChange, SequenceState Active, BlockingCause InternalMalfunction.",
      "Notification.ActiveAlerts: Failure DALLE-UNIT-PalletChange from PalletChange (Unit in malfunction: PalletChange).",
      "Read at 10:00 UTC.",
    ].join("\n"),
  )
})

test("the JobOrder in words names the job order and the program execution in it", () => {
  const jobOrder: TrulaserJobOrder = {
    ...about,
    jobOrder: {
      JobOrderID: "cc7f97c7",
      State: "Running",
      StateSince: "2026-11-18T09:30:00.000Z",
      JobName: "ProductionPlanRun cc7f97c7",
      WorkMasterID: "PLL_SHEET_0002",
      StartTime: "2026-11-18T09:30:00.000Z",
      EndTime: null,
      RunsCompleted: 1,
      JobResult: "Unknown",
    },
    signals: {
      executionId: signal("2a3b"),
      activeWorkMaster: signal("PLL_SHEET_0002"),
      executionState: signal("Running"),
      executionStartTime: signal("2026-11-18T09:45:00.000Z"),
      executionJobOrderId: signal("cc7f97c7"),
    },
  }
  assert.match(trulaserJobOrderInWords(jobOrder), /JobOrder cc7f97c7 Running since 09:30 UTC, 1 runs completed\.\nProgramExecution 2a3b: ActiveWorkMaster PLL_SHEET_0002, State Running, JobOrderID cc7f97c7\./)
})

test("a job order without a result yet is not told as zero runs", () => {
  const words = trulaserJobOrderInWords({
    ...about,
    jobOrder: {
      JobOrderID: "cc7f97c7",
      State: "Running",
      StateSince: null,
      JobName: null,
      WorkMasterID: null,
      StartTime: null,
      EndTime: null,
      RunsCompleted: null,
      JobResult: null,
    },
    signals: {
      executionId: signal(null),
      activeWorkMaster: signal(null),
      executionState: signal(null),
      executionStartTime: signal(""),
      executionJobOrderId: signal(null),
    },
  })
  assert.match(words, /JobOrder cc7f97c7 Running, no runs reported yet./)
})

test("the devices in words say each request, and an error code where there is one", () => {
  const devices: TrulaserDevices = {
    ...about,
    signals: { deviceRequestActive: signal(true) },
    devices: [
      { index: 0, type: signal("HandlingLoad"), state: signal("Active"), errorCode: signal("NoError") },
      { index: 3, type: signal("Separating"), state: signal("Error"), errorCode: signal("DoubleSheetDetected") },
    ],
  }
  assert.match(trulaserDevicesInWords(devices), /HandlingLoad Active, Separating Error \(DoubleSheetDetected\)/)
})
