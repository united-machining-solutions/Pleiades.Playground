import assert from "node:assert/strict"
import { test } from "node:test"

import { jobOrderShowOf } from "./results.ts"

const machine = "alcyone-machines_AX-400_P-04"
const shown = {
  asOf: "2026-11-17T09:00:00.000Z",
  machine,
  from: "2026-11-17T01:00:00.000Z",
  hours: 8,
  jobOrder: {
    machine,
    jobOrderId: "4711/01",
    state: "Running",
    changedAt: "2026-11-17T08:31:00.000Z",
    jobName: "Shaft",
    workMaster: "WM-SHAFT-4711",
    orderNumbers: [],
    runsPlanned: 10,
    plannedStart: null,
    plannedEnd: null,
    start: "2026-11-17T08:31:00.000Z",
    end: null,
    produced: 3,
    good: 3,
    result: "Unknown",
  },
  programExecution: {
    ExecutionId: "3f6c2a9e",
    JobOrderID: "4711/01",
    ActiveWorkMaster: "WM-SHAFT-4711",
    State: "Running",
    StartTime: "2026-11-17T08:31:00.000Z",
    EndTime: null,
    Duration: null,
    Interruptions: 0,
    PartsProduced: null,
  },
  jobOrders: 2,
  programExecutions: 5,
  aborted: 1,
  hasMore: false,
  topics: { jobs: `machines/${machine}/events/jobs`, workmasters: `machines/${machine}/events/workmasters` },
}

test("the JSON of genui_job_order_show becomes the job order of the machine", () => {
  const values = jobOrderShowOf(JSON.stringify(shown))
  assert.equal(values?.jobOrder?.jobOrderId, "4711/01")
  assert.equal(values?.programExecution?.ActiveWorkMaster, "WM-SHAFT-4711")
})

test("what does not keep the contract of the card is not drawn as one", () => {
  assert.equal(jobOrderShowOf(JSON.stringify({ ...shown, topics: undefined })), null)
  assert.equal(jobOrderShowOf("no job order"), null)
  assert.equal(jobOrderShowOf(undefined), null)
})
