import type { Machine } from "@pleiades/genui-mcp"

// Which value of the binding is which state on the screen. This file decides it, nothing else does.

export type State = "alarm" | "stopped" | "no-data" | "setup" | "running"

/** The simulator publishes every five seconds. A machine that is silent for longer is not live. */
export const SILENT_AFTER_SECONDS = 30

export const stateLabel: Record<State, string> = {
  alarm: "Alarm",
  stopped: "Stopped",
  "no-data": "No data",
  setup: "Setup",
  running: "Running",
}

/** Home asks "what needs you?": first the machines that do, then the rest. */
export const groups: ReadonlyArray<{ title: string; states: ReadonlyArray<State> }> = [
  { title: "Needs you", states: ["alarm", "stopped", "no-data"] },
  { title: "Setup", states: ["setup"] },
  { title: "Running", states: ["running"] },
]

export function openError(machine: Machine) {
  return machine.notifications.find((one) => one.level === "Error")
}

export function openWarning(machine: Machine) {
  return machine.notifications.find((one) => one.level === "Warning")
}

export function stateOf(machine: Machine, asOf: string): State {
  const silentFor =
    machine.lastValueAt === null ? Infinity : (Date.parse(asOf) - Date.parse(machine.lastValueAt)) / 1000
  // Without current values the other readings are the last known ones, not the present.
  if (machine.connection.value !== "Connected" || silentFor > SILENT_AFTER_SECONDS) return "no-data"
  if (openError(machine)) return "alarm"
  if (machine.operationMode.value === "Setup") return "setup"
  if (machine.itemState.value !== "Executing") return "stopped"
  return "running"
}
