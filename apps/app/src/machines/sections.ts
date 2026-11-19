import type { EnergyShow, MachineEnergy } from "@pleiades/cards/energy/contract.ts"
import type { MachineMeasurements, MeasurementList, MeasurementSeries, Quantity } from "@pleiades/cards/measurement/contract.ts"
import type { SiteList } from "@pleiades/cards/site/contract.ts"
import type { TimeseriesRange } from "@pleiades/cards/timeseries/contract.ts"

import { alertOf, filterOf } from "../live/messages.ts"
import type { Hours } from "./switcher.ts"

// What the page of one machine takes from the answers of the backend for its sections. It chooses
// among the values a tool returned and writes them out; it computes nothing. Every tool answers for
// every machine or for one, and the page shows one: these functions pick it.

/** Where a machine stands: a site and maybe a hall, on no site, or not known when the sites could not be read. */
export type Place = { site: string; hall: string | null } | "onNoSite" | null

/**
 * The place of a machine in the list of the sites. Where the Sites API did not answer (`sitesError`),
 * every machine is listed on no site; then the place is not known, not "on no site".
 */
export function placeOf(sites: SiteList | null, machine: string): Place {
  if (sites === null || sites.sitesError !== null) return null
  for (const site of sites.sites) {
    for (const hall of site.halls) {
      if (hall.machines.some((one) => one.machine === machine)) return { site: site.name, hall: hall.name }
    }
  }
  return sites.unplaced.some((one) => one.machine === machine) ? "onNoSite" : null
}

/**
 * True where the machine stands on a site and published no value in the last 24 hours, as the list of
 * the sites says (`now` is null): its page then says that it has no data, not that the machine is
 * unknown. A machine on no site, or sites that could not be read, are not known to be silent.
 */
export function silentOnSite(sites: SiteList | null, machine: string): boolean {
  if (sites === null || sites.sitesError !== null) return false
  return sites.sites.some((site) => site.halls.some((hall) => hall.machines.some((one) => one.machine === machine && one.now === null)))
}

/** The place in words, as the page writes it under its title: "South plant · Hall 2", "On no site". */
export function placeWords(place: Place): string | null {
  if (place === null) return null
  if (place === "onNoSite") return "On no site"
  return place.hall === null ? place.site : `${place.site} · ${place.hall}`
}

/** The hours of the page as a range of the time series card, which offers the same and a quarter of an hour. */
export function rangeOfHours(hours: Hours): TimeseriesRange {
  return `${hours}h`
}

/** What one machine measures now, from the list of every machine. */
export function measurementsOf(list: MeasurementList | null, machine: string): MachineMeasurements | null {
  return list?.machines.find((one) => one.machine === machine) ?? null
}

/**
 * Whether the machine has a value of any quantity, however old. A machine that publishes only its
 * connection has an entry with every value null: the section says it has no values.
 */
export function hasValues(measurements: MachineMeasurements | null): measurements is MachineMeasurements {
  return measurements !== null && measurements.measurements.some((one) => one.value !== null)
}

/** What the section of power and energy asks the time series card for: the power of the machine over the hours. */
export function powerRequest(machine: string, hours: Hours): { lines: Array<{ machine: string; signal: string }>; range: TimeseriesRange } {
  return { lines: [{ machine, signal: "activePower" }], range: rangeOfHours(hours) }
}

/** What the section of power and energy asks the energy card for: the energy of the machine over the hours. */
export function energyRequest(machine: string, hours: Hours): { machines: Array<string>; hours: Hours } {
  return { machines: [machine], hours }
}

/** Whether the machine has a value of a quantity, however old. */
function has(measurements: MachineMeasurements, quantity: Quantity): boolean {
  return measurements.measurements.some((one) => one.quantity === quantity && one.value !== null)
}

/**
 * What the section "Power and energy" can show of a machine: its power over time, its energy, both,
 * or neither, as its measurements say. Without them, both are asked for and the tools say the rest.
 */
export function powerAndEnergyOf(measurements: MachineMeasurements | null): { power: boolean; energy: boolean } {
  if (measurements === null) return { power: true, energy: true }
  const power = has(measurements, "activePower")
  return { power, energy: power || has(measurements, "energyImported") }
}

/**
 * The graph of one quantity with the line of one machine only: what the page draws below the values
 * of now. Null where the series has no line of the machine for it.
 */
export function oneLine(
  series: MeasurementSeries | null,
  quantity: Quantity,
  machine: string,
): (MeasurementSeries["quantities"][number] & Pick<MeasurementSeries, "from" | "to" | "instants">) | null {
  const graph = series?.quantities.find((one) => one.quantity === quantity)
  const lines = graph?.lines.filter((line) => line.machine === machine) ?? []
  if (series === null || graph === undefined || lines.length === 0) return null
  return { ...graph, lines, from: series.from, to: series.to, instants: series.instants }
}

/**
 * The energy of the machine for its tile: its line of the energy card over the hours of the page.
 * Null where the section did not ask for it, its answer did not come, or the machine is not in it.
 */
export function energyOf(show: EnergyShow | null, machine: string): { hours: number; machine: MachineEnergy } | null {
  const one = show?.machines.find((each) => each.machine === machine)
  return show && one ? { hours: show.hours, machine: one } : null
}

/** The topic of the alert events of one machine on the broker. */
export function alertFilter(machine: string): string {
  return filterOf("events/notifications", machine)
}

/** Whether a message of the broker raises, changes or clears an alert of the machine: then its list is read again. */
export function changesAlerts(topic: string, payload: string, machine: string, now = Date.now()): boolean {
  return topic === alertFilter(machine) && alertOf(payload, now) !== null
}
