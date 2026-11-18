import { written } from "../machine/format.ts"
import { signalValueFields } from "./contract.ts"
import type {
  ConditionTile,
  Shown,
  Signal,
  TrulaserCollision,
  TrulaserConditions,
  TrulaserDevices,
  TrulaserJobOrder,
  TrulaserStatus,
  TrulaserTechnology,
} from "./contract.ts"

// The TruLaser cards in words: how a value is written, and each card as lines for a reader that does
// not see it. A language model reads those lines as the result of the tool. The names are those of the
// data model, and of the extension of TRUMPF where the model has none.

type About = { serialNumber: string | null; machine: string; asOf: string }

/** The name of the machine: TruLaser and the serial number, or the machine id where there is none. */
export function trulaserTitle({ serialNumber, machine }: Pick<About, "serialNumber" | "machine">): string {
  return `TruLaser ${serialNumber ?? machine}`
}

/**
 * A stored value as a display writes it: a fraction in `one` as percent, a pressure in `pascal` as
 * millibar. A value in another unit than the one expected is written with its own unit.
 */
export function shownNumber(value: number, unit: string | null, shown: Shown): { number: string; unit: string } {
  if (shown === "percent" && unit === "one") return { number: (value * 100).toFixed(1), unit: "%" }
  if (shown === "millibar" && unit === "pascal") return { number: (value / 100).toFixed(1), unit: "mbar" }
  if (shown === "microsiemens") return { number: value.toFixed(1), unit: "µS" }
  return { number: String(value), unit: unit ?? "" }
}

/** A value of a tile, with its unit; a dash where there is none. */
export function tileValue(tile: Pick<ConditionTile, "value" | "shown">): string {
  const { value, unit } = tile.value
  if (typeof value !== "number") return "–"
  const shown = shownNumber(value, unit, tile.shown)
  return `${shown.number} ${shown.unit}`.trim()
}

/** A value as text; a dash where there is none. A yes or no is written as one. */
export function signalText(signal: Signal): string {
  if (signal.value === null || signal.value === "") return "–"
  if (typeof signal.value === "boolean") return signal.value ? "yes" : "no"
  return String(signal.value)
}

const read = (about: About) => `Read at ${written(about.asOf)}.`

/** State.Status and Notification.ActiveAlerts in words. */
export function trulaserStatusInWords(status: TrulaserStatus): string {
  const { signals, activeAlerts } = status
  const cause = signals.changeCauseValue.value
  const fields = signalValueFields(typeof cause === "string" ? cause : null)
  const value = fields ? fields.map((one) => `${one.name} ${one.value}`).join(", ") : signalText(signals.changeCauseValue)
  const alerts = activeAlerts.map((one) => `${one.Severity ?? "no category"} ${one.ErrorCode} from ${one.SourceName} (${one.Message})`)
  return [
    `${trulaserTitle(status)} (${status.machine}, Model ${signalText(signals.model)}): State.Status MachineryItemState ${signalText(signals.itemState)}, MachineryOperationMode ${signalText(signals.operationMode)}.`,
    `ChangeCause (extension): SignalName ${signalText(signals.changeCauseSignal)}, ${value}.`,
    alerts.length > 0 ? `Notification.ActiveAlerts: ${alerts.join("; ")}.` : "Notification.ActiveAlerts: none.",
    read(status),
  ].join("\n")
}

/** JobMonitoring.JobOrders and WorkMasterMonitoring.ProgramExecution in words. */
export function trulaserJobOrderInWords(jobOrder: TrulaserJobOrder): string {
  const { signals } = jobOrder
  const job = jobOrder.jobOrder
  return [
    job
      ? `${trulaserTitle(jobOrder)}: JobOrder ${job.JobOrderID} ${job.State}${job.StateSince ? ` since ${written(job.StateSince)}` : ""}, ${job.RunsCompleted ?? 0} runs completed.`
      : `${trulaserTitle(jobOrder)}: no JobOrder.`,
    `ProgramExecution ${signalText(signals.executionId)}: ActiveWorkMaster ${signalText(signals.activeWorkMaster)}, State ${signalText(signals.executionState)}, JobOrderID ${signalText(signals.executionJobOrderId)}.`,
    read(jobOrder),
  ].join("\n")
}

/** AutomationDeviceRequestStates in words. */
export function trulaserDevicesInWords(devices: TrulaserDevices): string {
  const states = devices.devices.map(
    (one) => `${signalText(one.type)} ${signalText(one.state)}${one.errorCode.value && one.errorCode.value !== "NoError" && one.errorCode.value !== "Invalid" ? ` (${signalText(one.errorCode)})` : ""}`,
  )
  return [
    `${trulaserTitle(devices)}: DeviceRequestStatusActive ${signalText(devices.signals.deviceRequestActive)}.`,
    `AutomationDeviceRequestStates (extension): ${states.join(", ") || "none"}.`,
    read(devices),
  ].join("\n")
}

/** LaserTechnology in words. */
export function trulaserTechnologyInWords(technology: TrulaserTechnology): string {
  const { signals } = technology
  return [
    `${trulaserTitle(technology)}: LaserTechnology (extension) DataProviderStatus ${signalText(signals.technologyStatus)}.`,
    `LaserParameterSet ${signalText(signals.technologyKey)}, Nozzle ${signalText(signals.technologyNozzle)}, Status ${signalText(signals.technologySetStatus)}.`,
    read(technology),
  ].join("\n")
}

/** CollisionData in words. */
export function trulaserCollisionInWords(collision: TrulaserCollision): string {
  const { signals } = collision
  const since = signals.collisionState.at ? ` since ${written(signals.collisionState.at)}` : ""
  return [
    `${trulaserTitle(collision)}: CollisionData (extension) DetectionState ${signalText(signals.collisionState)}${since}, NozzleCollisionStop ${signalText(signals.nozzleCollisionStop)}.`,
    `Program ${signalText(signals.collisionProgram)}, NC block ${signalText(signals.collisionBlockCurrent)}.`,
    read(collision),
  ].join("\n")
}

/** ConditionGuide in words: what is raised, and every value. */
export function trulaserConditionsInWords(conditions: TrulaserConditions): string {
  const raised = conditions.tiles.filter((one) => one.status === "error" || one.status === "warning")
  return [
    `${trulaserTitle(conditions)}: ConditionGuide (extension) ${raised.length > 0 ? `raised: ${raised.map((one) => `${one.label} (${one.status})`).join(", ")}` : "no threshold raised"}.`,
    conditions.tiles.map((one) => `${one.label} ${tileValue(one)}`).join(", ") + ".",
    read(conditions),
  ].join("\n")
}
