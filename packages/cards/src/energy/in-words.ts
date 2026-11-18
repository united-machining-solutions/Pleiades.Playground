import { written } from "../machine/format.ts"
import type { EnergyShow, MachineEnergy } from "./contract.ts"
import { inKilowattHours, kilowattHours, kilowatts, lastHours, writtenOn } from "./words.ts"

// The energy card in words, for a reader that does not see it: a language model reads these lines
// as the result of the tool, and a host without cards shows them.

/** The energy of one machine, in a line. */
export function machineEnergyInWords({ machine, energy, power }: MachineEnergy, from: string, withDay = false): string {
  let said: string
  if (energy.value !== null) {
    // A meter counted from its first value in the hours says so: it had none just before them.
    const late = energy.start && Date.parse(energy.start.at) > Date.parse(from) ? ` (counted from ${writtenOn(energy.start.at, withDay, written)}, its first value)` : ""
    said = `${machine}: ${kilowattHours(energy.value, energy.unit)}${late}`
  } else if (energy.meterWentBack) {
    said = `${machine}: energy not known, its meter went back in this time`
  } else if (energy.start && energy.end && energy.start.unit !== energy.end.unit) {
    said = `${machine}: energy not known, its meter changed from ${energy.start.unit} to ${energy.end.unit} in this time`
  } else if (energy.unit !== null && inKilowattHours(0, energy.unit) === null) {
    said = `${machine}: energy not known, its meter publishes in ${energy.unit}, not in watt hours or joule`
  } else {
    said = `${machine}: energy not known, its meter published no value`
  }
  const drawn: Array<string> = []
  if (power.meanWatt !== null) drawn.push(`mean power ${kilowatts(power.meanWatt)}`)
  if (power.peakWatt !== null) drawn.push(`peak ${kilowatts(power.peakWatt)}`)
  else if (power.error !== null) drawn.push("peak not known, the statistics of the Timeseries API did not answer")
  else if (power.unit !== null && power.unit !== "watt") drawn.push(`and its active power in ${power.unit}, not watt`)
  else if (power.meanWatt === null) drawn.push("no value of active power")
  return [said, ...drawn].join(", ") + "."
}

/** The card in words: what it is about, then a line for each machine, the one that imported the most first. */
export function energyShowInWords({ from, to, hours, machines }: EnergyShow): string {
  // Hours over midnight name their days.
  const withDay = from.slice(0, 10) !== to.slice(0, 10)
  const range = `from ${writtenOn(from, withDay, written)} to ${writtenOn(to, withDay, written)}`
  if (machines.length === 0) return `No machine published active power or its energy meter in ${lastHours(hours)}, ${range}.`
  return [`Energy imported in ${lastHours(hours)}, ${range}, from the meter of each machine:`, ...machines.map((one) => machineEnergyInWords(one, from, withDay))].join("\n")
}
