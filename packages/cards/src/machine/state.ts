import { SILENT_AFTER_SECONDS } from "./contract.ts"
import type { Machine, State } from "./contract.ts"

// Which value of the binding is which state on the screen. This file decides it, nothing else
// does: the backend asks it for the past, the lists and the cards for the present.

export const stateLabel: Record<State, string> = {
  alarm: "Alarm",
  stopped: "Stopped",
  "no-data": "No data",
  setup: "Setup",
  running: "Running",
}

/** The order in which a display reads the states, for example the sums of a history. */
export const stateOrder: ReadonlyArray<State> = ["running", "setup", "stopped", "alarm", "no-data"]

/** What is known about a machine at one instant. */
export type Known = {
  connection: string | null
  itemState: string | null
  operationMode: string | null
  /** An error was raised and has not gone. */
  error: boolean
  /** The newest sign of life, a heartbeat or any value, is no older than SILENT_AFTER_SECONDS. */
  live: boolean
}

export function stateFrom(known: Known): State {
  // Without a sign of life the values are the last known ones, not the present.
  if (!known.live || known.connection !== "Connected") return "no-data"
  if (known.error) return "alarm"
  if (known.operationMode === "Setup") return "setup"
  if (known.itemState !== "Executing") return "stopped"
  return "running"
}

export function openError(machine: Machine) {
  return machine.notifications.find((one) => one.level === "Error")
}

export function openWarning(machine: Machine) {
  return machine.notifications.find((one) => one.level === "Warning")
}

export function stateOf(machine: Machine, asOf: string): State {
  const silentFor =
    machine.lastValueAt === null ? Infinity : (Date.parse(asOf) - Date.parse(machine.lastValueAt)) / 1000
  return stateFrom({
    connection: machine.connection.value,
    itemState: machine.itemState.value,
    operationMode: machine.operationMode.value,
    error: openError(machine) !== undefined,
    live: silentFor <= SILENT_AFTER_SECONDS,
  })
}
