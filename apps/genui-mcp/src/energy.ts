import { ENERGY_HOURS, ENERGY_SLOTS, ENERGY_UNITS, MOST_ENERGY_HOURS } from "@pleiades/cards/energy/contract.ts"
import { READING_PATHS, SILENT_AFTER_SECONDS } from "@pleiades/cards/machine/contract.ts"
import type { EnergySeries, EnergyShow, MachineEnergy, MeterReading } from "@pleiades/cards/energy/contract.ts"

import { listTopics, readNewest, readOldest, readStatistics, readThinned, readTimelines } from "./apis.ts"
import type { Apis, Newest, Statistics } from "./apis.ts"
import { machineOf } from "./machines.ts"
import { silences, silentBetween } from "./liveness.ts"
import { slotEnds, slotted, sources, topicOf } from "./measurements.ts"
import { secondsBefore } from "./time.ts"

// How much energy machines imported over the last hours, and how much power they drew. The energy
// is the difference of the meter, which counts up in the unit it publishes in: watt hours, as the
// data model has it, or joule for values from before. The power is in watt. Nothing is converted:
// kilowatt hours are wording, in the cards package (ADR-0002, ADR-0017).

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

/**
 * The mean power over the time the energy covers, in watt: the energy divided by the time between
 * the two values of the meter it is the difference of. A watt hour an hour and a joule a second
 * are a watt, so nothing is converted. A meter that did not change gives 0 W; null if the energy
 * is not known.
 */
export function meanPowerOf(energy: Pick<MachineEnergy["energy"], "value" | "unit" | "start" | "end">): number | null {
  if (energy.value === null || energy.start === null || energy.end === null) return null
  if (energy.value === 0) return 0
  const seconds = (Date.parse(energy.end.at) - Date.parse(energy.start.at)) / 1000
  if (!(seconds > 0)) return null
  if (energy.unit === "wattHour") return energy.value / (seconds / 3600)
  if (energy.unit === "joule") return energy.value / seconds
  return null
}

/**
 * The peak of the active power, from the statistics of its topic, and the mean of the energy.
 * Statistics in another unit than watt are left out; statistics that did not answer say why.
 */
export function powerOf(
  statistics: Statistics | undefined,
  topic: string,
  meanWatt: number | null,
  error: string | null = null,
): MachineEnergy["power"] {
  if (statistics === undefined || statistics.unit !== "watt" || statistics.count === 0) {
    return { meanWatt, peakWatt: null, values: 0, unit: statistics?.unit ?? null, error, topic }
  }
  return { meanWatt, peakWatt: statistics.max, values: statistics.count, unit: statistics.unit, error, topic }
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

/** The heartbeat of a machine. */
const heartbeatOf = (machine: string) => `machines/${machine}/${READING_PATHS.heartbeat}`

/**
 * Whether the value of the meter before `from` still holds there: the machine was there since,
 * by its heartbeat, without a silence. A young value needs no look. An older one is checked over
 * at most the longest hours the card has; a meter that changes only when energy flows can be
 * that old while the machine stands still.
 */
async function heldAtStart(apis: Apis, machine: string, value: Newest, from: Date): Promise<boolean> {
  const age = from.getTime() - Date.parse(value.at)
  if (age <= SILENT_AFTER_SECONDS * 1000) return true
  const since = new Date(Math.max(Date.parse(value.at), from.getTime() - MOST_ENERGY_HOURS * 3_600_000))
  const beats = await readTimelines(apis, "baseUnitValues", heartbeatOf(machine), secondsBefore(since, SILENT_AFTER_SECONDS), from)
  const signs = [value.at, ...(beats.find((one) => one.topic === heartbeatOf(machine))?.samples.map((sample) => sample.at) ?? [])]
  const silent = silences(signs, since.toISOString(), from.toISOString())
  return !silentBetween(silent, value.at, from.toISOString())
}

/**
 * The energy and power of every machine that published active power or its meter in the last
 * `hours`, or gave a sign of life there and has a meter, or of the machines named. The `*` of the
 * Timeseries API reaches over several levels, so only the topics of the binding count, never one
 * below them.
 */
export async function showEnergy(
  apis: Apis,
  hours = ENERGY_HOURS,
  machines?: ReadonlyArray<string>,
  now = new Date(),
): Promise<EnergyShow> {
  const from = secondsBefore(now, hours * 60 * 60)
  // The energy needs no statistics: if they fail, only the peak is missing, and the result says why.
  const [topics, { statistics, failed }] = await Promise.all([
    listTopics(apis, from, now),
    readStatistics(apis, `machines/*/${sources.activePower.path}`, from, now).then(
      (statistics) => ({ statistics, failed: null }),
      (error: unknown) => ({ statistics: new Map<string, Statistics>(), failed: error instanceof Error ? error.message : String(error) }),
    ),
  ])
  const published = new Set(topics)
  const machinesOf = (ours: (machine: string, topic: string) => boolean) => [
    ...new Set(
      topics.flatMap((topic) => {
        const machine = machineOf(topic)
        return machine !== undefined && ours(machine, topic) ? [machine] : []
      }),
    ),
  ]
  const measured = machinesOf((machine, topic) => topic === topicOf(machine, "activePower") || topic === topicOf(machine, "energyImported"))
  // A machine that stands still may send only its heartbeat, with a meter that does not change.
  const alive = machinesOf((machine, topic) => topic === heartbeatOf(machine)).filter((machine) => !measured.includes(machine))
  const known = [...measured, ...alive].sort()
  const missing = (machines ?? []).filter((machine) => !known.includes(machine))
  if (missing.length > 0) {
    throw new Error(
      `No machine ${missing.map((one) => `"${one}"`).join(", ")} published active power, its energy meter or a heartbeat in the last ${hours === 1 ? "hour" : `${hours} hours`}. Machines that did: ${known.join(", ") || "none"}.`,
    )
  }
  const asked = machines === undefined ? known : [...new Set(machines)]

  const shown = await Promise.all(
    asked.map(async (machine): Promise<MachineEnergy> => {
      const meter = topicOf(machine, "energyImported")
      const [end, newest] = await Promise.all([readNewest(apis, "baseUnitValues", meter, now), readNewest(apis, "baseUnitValues", meter, from)])
      // The value before the hours, if the machine was there since. One before a silence may lie
      // before a gap, in which the machine imported energy outside these hours: the meter is then
      // counted from its first value in them, as one that began in them.
      const before = newest !== null && (await heldAtStart(apis, machine, newest, from)) ? newest : null
      const first = before === null && published.has(meter) ? await readOldest(apis, "baseUnitValues", meter, from, now) : null
      const start = readingOf(before ?? first)
      const stop = readingOf(end)
      const unit = (stop ?? start)?.unit ?? null
      const energy = { ...energyBetween(start, stop), start, end: stop, unit, topic: meter }
      const power = topicOf(machine, "activePower")
      return {
        machine,
        energy,
        power: powerOf(statistics.get(power), power, meanPowerOf(energy), failed),
      }
    }),
  )
  // A machine seen only by its heartbeat and without a meter has nothing to show.
  const worth = shown.filter((one) => machines !== undefined || !alive.includes(one.machine) || one.energy.end !== null)
  return { from: from.toISOString(), to: now.toISOString(), hours, machines: worth.sort(byEnergy) }
}

/**
 * The active power of machines between two instants, a line for each machine on the same
 * instants: what the graph of the energy card draws. The Timeseries API thins each line to twice
 * as many values as there are slots (LTTB, by count, not by time). At each instant a line has the
 * value that held, the newest of those kept, as the graphs of the measurements have it: from the
 * one that held where the lines begin, also where the API kept none in a slot, but not across a
 * silence of the machine. Its heartbeats say when it was there; every value is a sign of life too.
 * Machines asked for are read each for itself, never every machine with a wildcard.
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
  const beatsFrom = secondsBefore(from, SILENT_AFTER_SECONDS)
  // The topics of the machines asked for, each read for itself; every machine only where none is named.
  const [timelines, heartbeats] =
    machines === undefined
      ? await Promise.all([
          readThinned(apis, `machines/*/${sources.activePower.path}`, from, to, slots * 2),
          readTimelines(apis, "baseUnitValues", `machines/*/${READING_PATHS.heartbeat}`, beatsFrom, to),
        ])
      : await Promise.all([
          Promise.all(machines.map((machine) => readThinned(apis, topicOf(machine, "activePower"), from, to, slots * 2))).then((all) => all.flat()),
          Promise.all(machines.map((machine) => readTimelines(apis, "baseUnitValues", heartbeatOf(machine), beatsFrom, to))).then((all) => all.flat()),
        ])
  const samplesOf = (machine: string) => timelines.find((one) => one.topic === topicOf(machine, "activePower"))
  const heartbeatsOf = (machine: string) => heartbeats.find((one) => one.topic === heartbeatOf(machine))?.samples.map((sample) => sample.at) ?? []
  const shown =
    machines ??
    [...new Set(timelines.flatMap((one) => (machineOf(one.topic) !== undefined && one.topic === topicOf(machineOf(one.topic)!, "activePower") ? [machineOf(one.topic)!] : [])))].sort()
  // The value that held where the lines begin, however old, so a power published on change is drawn too.
  const held = await Promise.all(shown.map((machine) => readNewest(apis, "baseUnitValues", topicOf(machine, "activePower"), from)))
  const instants = slotEnds(from, to, slots)
  const lines = shown.flatMap((machine, index) => {
    const timeline = samplesOf(machine)
    const before = held[index]
    const unit = timeline?.unit ?? before?.unit ?? null
    if (unit !== "watt") return []
    const samples = timeline?.samples ?? []
    const measured = [...(before && before.unit === "watt" ? [{ at: before.at, value: before.value }] : []), ...samples]
    if (measured.length === 0) return []
    const signs = [...heartbeatsOf(machine), ...samples.map((sample) => sample.at)]
    const silent = silences(signs, from.toISOString(), to.toISOString())
    const watt = slotted(measured, instants, silent).map((value) => (typeof value === "number" ? value : null))
    return [{ machine, topic: topicOf(machine, "activePower"), watt }]
  })
  const order = machines ?? lines.map((line) => line.machine).sort()
  lines.sort((a, b) => order.indexOf(a.machine) - order.indexOf(b.machine))
  return { from: from.toISOString(), to: to.toISOString(), instants, lines }
}
