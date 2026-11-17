import { ENERGY_HOURS, ENERGY_SLOTS, MOST_ENERGY_HOURS } from "@pleiades/cards/energy/contract.ts"
import type { EnergySeries, EnergyShow, MachineEnergy, MeterReading } from "@pleiades/cards/energy/contract.ts"

import { listTopics, readNewest, readOldest, readStatistics, readThinned } from "./apis.ts"
import type { Apis, Newest, Statistics } from "./apis.ts"
import { machineOf } from "./machines.ts"
import { slotEnds, sources, topicOf } from "./measurements.ts"
import { secondsBefore } from "./time.ts"

// How much energy machines imported over the last hours, and how much power they drew. The energy
// is the difference of the meter, which counts up in joule; the power is in watt. Nothing is
// converted: kilowatt hours are wording, in the cards package.

/** A meter value in joule, or null if there is none or it is in another unit. */
function inJoule(value: Newest | null): MeterReading | null {
  if (value === null || typeof value.value !== "number" || value.unit !== "joule") return null
  return { joule: value.value, at: value.at }
}

/** The energy imported between two values of the meter. A meter that went back was reset: then it is not known. */
export function energyBetween(start: MeterReading | null, end: MeterReading | null): Pick<MachineEnergy["energy"], "joule" | "meterWentBack"> {
  if (start === null || end === null) return { joule: null, meterWentBack: false }
  const difference = end.joule - start.joule
  return difference < 0 ? { joule: null, meterWentBack: true } : { joule: difference, meterWentBack: false }
}

/** Mean and peak of the active power, from the statistics of its topic. Statistics in another unit than watt are left out. */
export function powerOf(statistics: Statistics | undefined, topic: string): MachineEnergy["power"] {
  if (statistics === undefined || statistics.unit !== "watt" || statistics.count === 0) {
    return { meanWatt: null, peakWatt: null, values: 0, topic }
  }
  return { meanWatt: statistics.mean, peakWatt: statistics.max, values: statistics.count, topic }
}

/** The machine that imported the most first; a machine whose energy is not known last; else by serial number. */
export function byEnergy(a: MachineEnergy, b: MachineEnergy): number {
  const [ja, jb] = [a.energy.joule, b.energy.joule]
  if (ja === jb) return a.machine.localeCompare(b.machine)
  if (ja === null) return 1
  if (jb === null) return -1
  return jb - ja
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
      const [end, before] = await Promise.all([readNewest(apis, "baseUnitValues", meter, now), readNewest(apis, "baseUnitValues", meter, from)])
      // A meter without a value before the hours began is counted from its first one in them.
      const first = before === null && published.has(meter) ? await readOldest(apis, "baseUnitValues", meter, from, now) : null
      const start = inJoule(before ?? first)
      const stop = inJoule(end)
      const power = topicOf(machine, "activePower")
      return {
        machine,
        energy: { ...energyBetween(start, stop), start, end: stop, topic: meter },
        power: powerOf(statistics.get(power), power),
      }
    }),
  )
  return { from: from.toISOString(), to: now.toISOString(), hours, machines: shown.sort(byEnergy) }
}

/**
 * The mean of the values of each slot, a slot being the time up to its instant from the one
 * before; the first begins at `from`. Null where a slot has no value.
 */
export function slotMeans(
  samples: ReadonlyArray<{ at: string; value: number | boolean }>,
  from: string,
  instants: ReadonlyArray<string>,
): Array<number | null> {
  const sums = instants.map(() => ({ sum: 0, count: 0 }))
  const ends = instants.map((one) => Date.parse(one))
  const begin = Date.parse(from)
  for (const sample of samples) {
    if (typeof sample.value !== "number") continue
    const at = Date.parse(sample.at)
    if (at < begin) continue
    const slot = ends.findIndex((end) => at <= end)
    if (slot === -1) continue
    sums[slot]!.sum += sample.value
    sums[slot]!.count += 1
  }
  return sums.map(({ sum, count }) => (count === 0 ? null : sum / count))
}

/**
 * The active power of machines between two instants, a line for each machine on the same
 * instants: what the graph of the energy card draws. The Timeseries API thins each line to twice
 * as many values as there are slots, so every slot keeps one at least while the machine publishes.
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
  const timelines = await readThinned(apis, `machines/*/${sources.activePower.path}`, from, to, slots * 2)
  const instants = slotEnds(from, to, slots)
  const lines = timelines.flatMap((timeline) => {
    const machine = machineOf(timeline.topic)
    if (machine === undefined || timeline.topic !== topicOf(machine, "activePower")) return []
    if (machines !== undefined && !machines.includes(machine)) return []
    if (timeline.unit !== "watt") return []
    return [{ machine, topic: timeline.topic, watt: slotMeans(timeline.samples, from.toISOString(), instants) }]
  })
  const order = machines ?? lines.map((line) => line.machine).sort()
  lines.sort((a, b) => order.indexOf(a.machine) - order.indexOf(b.machine))
  return { from: from.toISOString(), to: to.toISOString(), instants, lines }
}
