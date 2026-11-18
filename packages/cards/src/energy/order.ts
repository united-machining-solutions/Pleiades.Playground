import { sliceOf } from "../shared/paging.ts"
import type { MachineEnergy } from "./contract.ts"
import { inKilowattHours } from "./words.ts"

// The order and the pages of the energy card. The result of the tool stays whole and in its order;
// a person chooses here how the card lists it. This is the display, so it may compare energies of
// two units in kilowatt hours, which the backend does not.

/** The orders a person can choose, the first by default. */
export const ENERGY_ORDERS = ["energy", "mean", "peak", "name"] as const
export type EnergyOrder = (typeof ENERGY_ORDERS)[number]

/** How many machines a page of the card lists. */
export const MACHINES_PER_PAGE = 5

/** What orders a machine by a figure: the larger first, a machine without it last. */
const figureOf: Record<Exclude<EnergyOrder, "name">, (one: MachineEnergy) => number | null> = {
  energy: (one) => (one.energy.value === null ? null : inKilowattHours(one.energy.value, one.energy.unit)),
  mean: (one) => one.power.meanWatt,
  peak: (one) => one.power.peakWatt,
}

/** The machines in the order chosen. Ties, and machines without the figure, go by machine id. */
export function ordered(machines: ReadonlyArray<MachineEnergy>, order: EnergyOrder): Array<MachineEnergy> {
  const byId = (a: MachineEnergy, b: MachineEnergy) => a.machine.localeCompare(b.machine)
  if (order === "name") return [...machines].sort(byId)
  const figure = figureOf[order]
  return [...machines].sort((a, b) => {
    const [fa, fb] = [figure(a), figure(b)]
    if (fa === null || fb === null) return fa === fb ? byId(a, b) : fa === null ? 1 : -1
    return fb - fa || byId(a, b)
  })
}

/** One page of the machines in the order chosen, and where it lies among all of them. */
export type EnergyPage = {
  machines: Array<MachineEnergy>
  /** The page shown, from 1. A page beyond the last shows the last. */
  page: number
  pages: number
  /** The place of the first and the last machine of the page, from 1; 0 and 0 without machines. */
  first: number
  last: number
  total: number
}

/** The machines of one page, in the order chosen. */
export function pageOf(machines: ReadonlyArray<MachineEnergy>, order: EnergyOrder, page: number): EnergyPage {
  const all = ordered(machines, order)
  const { items: onPage, page: shown, pages, start } = sliceOf(all, MACHINES_PER_PAGE, page)
  return {
    machines: onPage,
    page: shown,
    pages,
    first: onPage.length === 0 ? 0 : start + 1,
    last: start + onPage.length,
    total: all.length,
  }
}
