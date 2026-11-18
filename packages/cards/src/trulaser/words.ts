import { written } from "../machine/format.ts"
import type { ConditionTile, Shown, Signal, TrulaserShow } from "./contract.ts"

// The TruLaser card in words: how a value is written, and the card as lines for a reader that does
// not see it. A language model reads those lines as the result of the tool.

/** The title of the card: TruLaser and the serial number, or the machine id where there is none. */
export function trulaserTitle({ serialNumber, machine }: Pick<TrulaserShow, "serialNumber" | "machine">): string {
  return `TruLaser ${serialNumber ?? machine}`
}

/** The sign a display writes after a value of the condition guide. */
export const shownUnit: Record<Shown, string> = { percent: "%", millibar: "mbar", microsiemens: "µS" }

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

/** The card in words. */
export function trulaserShowInWords(shown: TrulaserShow): string {
  const { signals, sequence, unitsInMalfunction, devices, conditionGuide } = shown
  const cause = signals.changeCauseSignal.value
    ? `${signalText(signals.changeCauseSignal)}${
        sequence ? ` (sequence ${sequence.sequenceState}${sequence.blockingCause ? `, blocked by ${sequence.blockingCause}` : ""})` : ""
      }`
    : "unknown"
  const active = devices.filter((one) => one.state.value === "Active").map((one) => signalText(one.type))
  const raised = conditionGuide.filter((one) => one.status === "error" || one.status === "warning")
  return [
    `${trulaserTitle(shown)} (${shown.machine}): ${signalText(signals.itemState)}, operation mode ${signalText(signals.operationMode)}. Change cause: ${cause}.`,
    unitsInMalfunction.length > 0 ? `Units in malfunction: ${unitsInMalfunction.join(", ")}.` : "No unit is in malfunction.",
    `Program ${signalText(signals.programName)}: ${signalText(signals.programRunState)}. Production plan: ${signalText(signals.productionPlanRunState)}.`,
    `Automation requests: ${active.length > 0 ? `active for ${active.join(", ")}` : "none active"} (${devices.length} devices).`,
    `Collision detection: ${signalText(signals.collisionState)}${signals.collisionState.at ? ` since ${written(signals.collisionState.at)}` : ""}.`,
    raised.length > 0
      ? `Condition guide: ${raised.map((one) => `${one.label} ${tileValue(one)} (${one.status})`).join(", ")}.`
      : "Condition guide: no threshold raised.",
    `Read at ${written(shown.asOf)}.`,
  ].join("\n")
}
