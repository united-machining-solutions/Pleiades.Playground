import assert from "node:assert/strict"
import { test } from "node:test"

import type { Machine, MachineList, Reading } from "@pleiades/cards/machine/contract.ts"

import { escalationsOf } from "./escalation.ts"
import { splitHeadline } from "./board.ts"

const asOf = "2026-11-18T12:30:00.000+01:00"
const justNow = "2026-11-18T12:29:55.000+01:00"

function reading(value: string | null, topic: string): Reading {
  return { value, at: justNow, since: "2026-11-18T12:00:00.000+01:00", sinceIsLowerBound: false, topic }
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
    jobOrder: null,
    lastValueAt: justNow,
    notifications: [],
    ...changes,
  }
}

const alert = { correlationId: "a1", topic: "machines/x/events", raisedAt: "2026-11-18T12:15:00.000+01:00" }

const list: MachineList = {
  asOf,
  windowSeconds: 1800,
  machines: [
    machine("merope-microtec_MM-120_M-02"),
    machine("alcyone-machines_AX-400_P-04", {
      notifications: [{ ...alert, notificationId: "31002", severity: "Failure", level: "Error", title: "Spindle drive fault" }],
    }),
    machine("taygeta-precision_TP-800_P-07", {
      notifications: [{ ...alert, notificationId: "4101", severity: "MaintenanceRequired", level: "Warning", title: "Coolant filter clogged" }],
    }),
  ],
}

test("a standstill is red, a warning on a machine that runs is to prevent, the rest is fine", () => {
  const escalations = escalationsOf(list)
  assert.deepEqual(
    escalations.stops.map((one) => `${one.name}: ${one.what}`),
    ["P-04: Spindelantrieb gestört"],
  )
  assert.deepEqual(
    escalations.risks.map((one) => `${one.name}: ${one.what}`),
    ["P-07: Coolant filter clogged"],
  )
  assert.equal(escalations.fine, 1)
})

test("the headline of an answer is its first sentence, the rest explains it", () => {
  assert.deepEqual(splitHeadline("M-02 steht, weil der Stangenlader leer ist. Den Verlauf siehst du im Chart."), [
    "M-02 steht, weil der Stangenlader leer ist.",
    "Den Verlauf siehst du im Chart.",
  ])
  assert.deepEqual(splitHeadline("Alles läuft."), ["Alles läuft.", ""])
})

test("a colon ends the headline too", () => {
  assert.deepEqual(splitHeadline("P-04 läuft mit voller Leistung: Die Spindel dreht."), ["P-04 läuft mit voller Leistung.", "Die Spindel dreht."])
})
