import { written } from "../machine/format.ts"
import type { EnergyShow, MachineEnergy } from "./contract.ts"
import { kilowattHours, kilowatts, lastHours } from "./words.ts"

// The energy card in words, for a reader that does not see it: a language model reads these lines
// as the result of the tool, and a host without cards shows them.

/** The energy of one machine, in a line. */
export function machineEnergyInWords({ machine, energy, power }: MachineEnergy, from: string): string {
  let said: string
  if (energy.joule !== null) {
    // A meter without a value before the hours began is counted from its first one in them.
    const late = energy.start && Date.parse(energy.start.at) > Date.parse(from) ? ` (counted from ${written(energy.start.at)}, its first value)` : ""
    said = `${machine}: ${kilowattHours(energy.joule)}${late}`
  } else if (energy.meterWentBack) {
    said = `${machine}: energy not known, its meter went back in this time`
  } else {
    said = `${machine}: energy not known, its meter published no value`
  }
  const drawn =
    power.meanWatt !== null && power.peakWatt !== null
      ? `, mean power ${kilowatts(power.meanWatt)} while it published, peak ${kilowatts(power.peakWatt)}`
      : ", no value of active power"
  return `${said}${drawn}.`
}

/** The card in words: what it is about, then a line for each machine, the one that imported the most first. */
export function energyShowInWords({ from, to, hours, machines }: EnergyShow): string {
  const range = `from ${written(from)} to ${written(to)}`
  if (machines.length === 0) return `No machine published active power or its energy meter in ${lastHours(hours)}, ${range}.`
  return [`Energy imported in ${lastHours(hours)}, ${range}, from the meter of each machine:`, ...machines.map((one) => machineEnergyInWords(one, from))].join("\n")
}
