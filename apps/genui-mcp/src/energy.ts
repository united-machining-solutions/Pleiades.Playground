import { ENERGY_HOURS, ENERGY_SLOTS, ENERGY_UNITS, MOST_ENERGY_HOURS } from "@pleiades/cards/energy/contract.ts"
import { READING_PATHS, SILENT_AFTER_SECONDS } from "@pleiades/cards/machine/contract.ts"
import type { EnergySeries, EnergyShow, MachineEnergy, MeterReading } from "@pleiades/cards/energy/contract.ts"

import { listTopics, readNewest, readOldest, readStatistics, readThinned, readTimelines } from "./apis.ts"
import type { Apis, Newest, Statistics } from "./apis.ts"
import { machineOf } from "./machines.ts"
import { silences } from "./liveness.ts"
import { slotEnds, slotted, sources, topicOf } from "./measurements.ts"
import { secondsBefore } from "./time.ts"

// How much energy machines imported over the last hours, and how much power they drew. The energy
// is the difference of the meter, which counts up in the unit it publishes in: watt hours, as the
// data model has it, or joule for values from before. The power is in watt. Nothing is converted:
// kilowatt hours are wording, in the cards package (ADR-0002).

/** Whether a unit is one a meter of energy publishes in. */
const isEnergyUnit = (unit: string | null): boolean => (ENERGY_UNITS as ReadonlyArray<string | null>).includes(unit)

/** A value of the meter as it was published, or null if there is none. */
function readingOf(value: Newest | null): MeterReading | null {
  if (value === null || typeof value.value !== "number") return null
  return { value: value.value, unit: value.unit, at: value.at }
}

/**
 * The energy imported between two values of the meter, in its unit. It is not known if the meter
 * publishes in a unit that is not one of energy, changed its unit in between, or went back: then
 * it was reset.
 */
export function energyBetween(start: MeterReading | null, end: MeterReading | null): Pick<MachineEnergy["energy"], "value" | "meterWentBack"> {
  if (start === null || end === null) return { value: null, meterWentBack: false }
  if (start.unit !== end.unit || !isEnergyUnit(end.unit)) return { value: null, meterWentBack: false }
  const difference = end.value - start.value
  return difference < 0 ? { value: null, meterWentBack: true } : { value: difference, meterWentBack: false }
}

/** Mean and peak of the active power, from the statistics of its topic. Statistics in another unit than watt are left out. */
export function powerOf(statistics: Statistics | undefined, topic: string): MachineEnergy["power"] {
  if (statistics === undefined || statistics.unit !== "watt" || statistics.count === 0) {
    return { meanWatt: null, peakWatt: null, values: 0, unit: statistics?.unit ?? null, topic }
  }
  return { meanWatt: statistics.mean, peakWatt: statistics.max, values: statistics.count, unit: statistics.unit, topic }
}

/**
 * Machines in watt hours first, then those in joule, each the one that imported the most first; a
 * machine whose energy is not known last; else by machine id. Two units are not compared.
 */
export function byEnergy(a: MachineEnergy, b: MachineEnergy): number {
  const rank = (one: MachineEnergy) =>
    one.energy.value === null ? ENERGY_UNITS.length : (ENERGY_UNITS as ReadonlyArray<string | null>).indexOf(one.energy.unit)
  return rank(a) - rank(b) || (b.energy.value ?? 0) - (a.energy.value ?? 0) || a.machine.localeCompare(b.machine)
}

/**
 * The energy and power of every machine that published active power or its meter in the last
 * `hours`, or of the machines named. The `*` of the Timeseries API reaches over several levels, so
 * only the topics of the binding count, never one below them.
 */
export async function showEnergy(
  apis: Apis,
  hours = ENERGY_HOURS,
  machines?: ReadonlyArray<string>,
  now = new Date(),
): Promise<EnergyShow> {
  const from = secondsBefore(now, hours * 60 * 60)
  const [topics, statistics] = await Promise.all([
    listTopics(apis, from, now),
    readStatistics(apis, `machines/*/${sources.activePower.path}`, from, now),
  ])
  const published = new Set(topics)
  const known = [
    ...new Set(
      topics.flatMap((topic) => {
        const machine = machineOf(topic)
        if (machine === undefined) return []
        const ours = topic === topicOf(machine, "activePower") || topic === topicOf(machine, "energyImported")
        return ours ? [machine] : []
      }),
    ),
  ].sort()
  const missing = (machines ?? []).filter((machine) => !known.includes(machine))
  if (missing.length > 0) {
    throw new Error(
      `No machine ${missing.map((one) => `"${one}"`).join(", ")} published active power or its energy meter in the last ${hours === 1 ? "hour" : `${hours} hours`}. Machines that did: ${known.join(", ") || "none"}.`,
    )
  }
  const asked = machines === undefined ? known : [...new Set(machines)]

  const shown = await Promise.all(
    asked.map(async (machine): Promise<MachineEnergy> => {
      const meter = topicOf(machine, "energyImported")
      const [end, newest] = await Promise.all([readNewest(apis, "baseUnitValues", meter, now), readNewest(apis, "baseUnitValues", meter, from)])
      // The value just before the hours began, if the meter published one then. An older one may
      // lie before a gap, in which the machine imported energy outside these hours: the meter is
      // then counted from its first value in them, as one that began in them.
      const before = newest !== null && Date.parse(newest.at) >= from.getTime() - SILENT_AFTER_SECONDS * 1000 ? newest : null
      const first = before === null && published.has(meter) ? await readOldest(apis, "baseUnitValues", meter, from, now) : null
      const start = readingOf(before ?? first)
      const stop = readingOf(end)
      const unit = (stop ?? start)?.unit ?? null
      const power = topicOf(machine, "activePower")
      return {
        machine,
        energy: { ...energyBetween(start, stop), start, end: stop, unit, topic: meter },
        power: powerOf(statistics.get(power), power),
      }
    }),
  )
  return { from: from.toISOString(), to: now.toISOString(), hours, machines: shown.sort(byEnergy) }
}

/**
 * The active power of machines between two instants, a line for each machine on the same
 * instants: what the graph of the energy card draws. The Timeseries API thins each line to twice
 * as many values as there are slots (LTTB, by count, not by time). At each instant a line has the
 * value that held, the newest of those kept, as the graphs of the measurements have it: also where
 * the API kept none in a slot, but not across a silence of the machine. Its heartbeats say when it
 * was there; every value is a sign of life too.
 */
export async function listEnergySeries(
  apis: Apis,
  fromInstant: string,
  toInstant: string,
  machines?: ReadonlyArray<string>,
  slots = ENERGY_SLOTS,
): Promise<EnergySeries> {
  const from = new Date(fromInstant)
  const to = new Date(toInstant)
  const hours = (to.getTime() - from.getTime()) / 3_600_000
  if (!(hours > 0) || hours > MOST_ENERGY_HOURS) {
    throw new Error(`\`to\` must lie after \`from\`, at most ${MOST_ENERGY_HOURS} hours: from ${fromInstant} to ${toInstant} does not.`)
  }
  const [timelines, heartbeats] = await Promise.all([
    readThinned(apis, `machines/*/${sources.activePower.path}`, from, to, slots * 2),
    readTimelines(apis, "baseUnitValues", `machines/*/${READING_PATHS.heartbeat}`, secondsBefore(from, SILENT_AFTER_SECONDS), to),
  ])
  const heartbeatsOf = (machine: string) =>
    heartbeats.find((one) => one.topic === `machines/${machine}/${READING_PATHS.heartbeat}`)?.samples.map((sample) => sample.at) ?? []
  const instants = slotEnds(from, to, slots)
  const lines = timelines.flatMap((timeline) => {
    const machine = machineOf(timeline.topic)
    if (machine === undefined || timeline.topic !== topicOf(machine, "activePower")) return []
    if (machines !== undefined && !machines.includes(machine)) return []
    if (timeline.unit !== "watt") return []
    const signs = [...heartbeatsOf(machine), ...timeline.samples.map((sample) => sample.at)]
    const silent = silences(signs, from.toISOString(), to.toISOString())
    const watt = slotted(timeline.samples, instants, silent).map((value) => (typeof value === "number" ? value : null))
    return [{ machine, topic: timeline.topic, watt }]
  })
  const order = machines ?? lines.map((line) => line.machine).sort()
  lines.sort((a, b) => order.indexOf(a.machine) - order.indexOf(b.machine))
  return { from: from.toISOString(), to: to.toISOString(), instants, lines }
}
