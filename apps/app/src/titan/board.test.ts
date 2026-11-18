import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine, MachineList, Reading } from "@pleiades/cards/machine/contract.ts"
import { clock } from "@pleiades/cards/machine/format.ts"

import { boardOf, headlineOf, jobInWords, keyFactsOf, machinesNamed, sinceInWords } from "./board.ts"

const asOf = "2026-11-18T12:30:00.000+01:00"
const justNow = "2026-11-18T12:29:55.000+01:00"

function reading(value: string | null, topic: string, since = "2026-11-18T12:00:00.000+01:00"): Reading {
  return { value, at: justNow, since, sinceIsLowerBound: false, topic }
}

function machine(id: string, changes: Partial<Machine> = {}): Machine {
  const base = `machines/${id}/umati`
  return {
    machine: id,
    identity: { manufacturer: "Alcyone Machine Works", model: id.split("_")[1] ?? null, serialNumber: id.split("_")[2] ?? id },
    connection: reading("Running", `${base}/Connection/State`),
    heartbeat: reading("1", `${base}/Connection/Heartbeat`),
    itemState: reading("Executing", `${base}/State/MachineryItemState`),
    operationMode: reading("Processing", `${base}/State/MachineryOperationMode`),
    program: reading("WM-PIN-1204", `${base}/Production/ActiveProgram`),
    jobOrder: { jobOrderId: "8801/01", state: "Running", producedQuantity: 11, runsPlanned: 40 },
    lastValueAt: justNow,
    notifications: [],
    ...changes,
  }
}

const spindle = {
  correlationId: "a1",
  notificationId: "31002",
  severity: "Failure" as const,
  level: "Error" as const,
  title: "Spindle drive fault",
  raisedAt: "2026-11-18T12:15:00.000+01:00",
  topic: "machines/x/events",
}

const list: MachineList = {
  asOf,
  windowSeconds: 1800,
  machines: [
    machine("merope-microtec_MM-120_M-02"),
    machine("alcyone-machines_AX-400_P-04", {
      notifications: [spindle],
      jobOrder: { jobOrderId: "4711/01", state: "Interrupted", producedQuantity: 5, runsPlanned: 12 },
    }),
    machine("taygeta-precision_TP-800_P-07", { operationMode: reading("Setup", "machines/x/mode") }),
  ],
}

test("the board names what needs someone, with the problem, what it costs and since when", () => {
  const board = boardOf(list)
  assert.equal(board.total, 3)
  assert.equal(board.producing, 1)
  assert.deepEqual(board.issues, [
    {
      name: "P-04",
      model: "AX-400",
      state: "alarm",
      problem: "Spindle drive fault",
      code: "Fehler 31002",
      since: spindle.raisedAt,
      impact: "Auftrag 4711/01 unterbrochen, 5 von 12 Teilen",
      step: null,
    },
  ])
})

test("what runs or is set up is planned, one line each, set up first", () => {
  assert.deepEqual(
    boardOf(list).planned.map((one) => `${one.name}: ${one.line}`),
    ["P-07: Wird eingerichtet · Auftrag 8801/01, 11 von 40 Teilen", "M-02: WM-PIN-1204 · Auftrag 8801/01, 11 von 40 Teilen"],
  )
})

test("the advice of the model says the problem in plain words and the next step", () => {
  const board = boardOf(list, new Map([["P-04", { problem: "Der Spindelantrieb ist ausgefallen.", step: "Instandhaltung rufen." }]]))
  assert.equal(board.issues[0]?.problem, "Der Spindelantrieb ist ausgefallen.")
  assert.equal(board.issues[0]?.step, "Instandhaltung rufen.")
})

test("the headline says in one line how many need someone", () => {
  assert.equal(headlineOf(boardOf(list)), "1 von 3 Maschinen braucht dich")
  assert.equal(headlineOf(boardOf({ ...list, machines: [machine("merope-microtec_MM-120_M-02")] })), "Alle Maschinen produzieren")
})

test("a job order and a time read as a person says them", () => {
  assert.equal(jobInWords(null), null)
  assert.equal(jobInWords({ jobOrderId: "5101/01", state: "Running", producedQuantity: null, runsPlanned: 6 }), "Auftrag 5101/01")
  assert.equal(sinceInWords("2026-11-18T12:15:00.000+01:00", asOf), "15 min")
  assert.equal(sinceInWords("2026-11-18T10:25:00.000+01:00", asOf), "2 h 5 min")
})

test("the key facts of a machine: since when, the error, the job order", () => {
  const facts = keyFactsOf(list, "P-04")
  assert.equal(facts?.state, "alarm")
  assert.deepEqual(facts?.facts, [
    { label: "Zustand", value: "Störung", detail: `seit ${clock(spindle.raisedAt)} · 15 min` },
    { label: "Ursache", value: "Spindelantrieb gestört", detail: "Fehler 31002" },
    { label: "Auftrag", value: "5 von 12 Teilen", detail: "Auftrag 4711/01 · unterbrochen" },
  ])
  assert.equal(keyFactsOf(list, "X-99"), undefined)
})

test("an answer names its machines by serial number, each once", () => {
  assert.deepEqual(machinesNamed("P-04 steht, M‑02 läuft. Ruf jemand an P-04."), ["P-04", "M-02"])
})
