import assert from "node:assert/strict"
import { test } from "node:test"

import { jobOrderShow } from "./contract.ts"
import type { JobOrderShow } from "./contract.ts"
import { jobOrderShowInWords } from "./in-words.ts"

const machine = "alcyone-machines_AX-400_P-04"
const shown: JobOrderShow = {
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
    State: "Ended",
    StartTime: "2026-11-17T08:31:00.000Z",
    EndTime: "2026-11-17T08:41:00.000Z",
    Duration: 600,
    Interruptions: 0,
    PartsProduced: 1,
  },
  jobOrders: 2,
  programExecutions: 5,
  aborted: 1,
  hasMore: false,
  topics: { jobs: `machines/${machine}/events/jobs`, workmasters: `machines/${machine}/events/workmasters` },
}

test("the example keeps the contract", () => {
  assert.ok(jobOrderShow.safeParse(shown).success)
})

test("the words name the job order and the program execution by the names of the data model", () => {
  const words = jobOrderShowInWords(shown)
  assert.match(words, /2 job orders and 5 program executions, 1 of them aborted/)
  assert.match(words, /JobOrder 4711\/01 \(Shaft\): State Running/)
  assert.match(words, /3 of 10 produced/)
  assert.match(words, /ProgramExecution of WM-SHAFT-4711 in job order 4711\/01: State Ended/)
  assert.match(words, /10 min/)
})

test("one job order and one program execution are counted in the singular", () => {
  const words = jobOrderShowInWords({ ...shown, jobOrders: 1, programExecutions: 1, aborted: 0 })
  assert.match(words, /: 1 job order and 1 program execution\./)
})

test("counts that may miss some say at least, and a machine without job orders says so", () => {
  const words = jobOrderShowInWords({ ...shown, jobOrder: null, programExecution: null, hasMore: true })
  assert.match(words, /at least 2 job orders/)
  assert.match(words, /The machine has no job order\./)
  assert.match(words, /The machine has no program execution\./)
})
