/** The job the page can start again: the robot program in channel 0, the program of the OSACA in channel 1. */
export const JOB = { nc_ch1: "Stäubli.nc", nc_ch2: "Osaca.nc" } as const

/**
 * The address of the simulation of the OSACA cell, from the setting `OSACA_SIM_URL`: its HMI, its REST API and
 * the 3D model of the cell lie there. Read on the server only, when a handler runs; null while it is not set.
 */
export function simUrl(): string | null {
  const url = process.env.OSACA_SIM_URL?.trim()
  return url ? url.replace(/\/+$/, "") : null
}

/** Why the page cannot reach the simulation while the setting is missing. */
export const NO_SIM_URL = "The address of the OSACA simulation is not set: set OSACA_SIM_URL."
