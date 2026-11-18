import { createServerFn } from "@tanstack/react-start"

import { JOB, NO_SIM_URL, simUrl } from "./sim.ts"

/** Whether the simulation took the commands, or why not. */
export type Started = { started: true; error: null } | { started: false; error: string }

/** The channels of the cell: 0 the robot, 1 the milling machine. */
const CHANNELS = [0, 1] as const

/** How long the channels get after the reset before the job starts: the reset takes effect over a few cycles. */
const AFTER_RESET_MS = 500

/** One command to the CNC of the simulation, as its own HMI sends it: `POST /api/cnc/cmd`. */
async function send(sim: string, command: unknown): Promise<void> {
  const response = await fetch(`${sim}/api/cnc/cmd`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`the simulation answered ${response.status} to ${JSON.stringify(command)}`)
}

/**
 * Starts the preconfigured job again on the simulation of the cell (window_osaca_plc, `src/hmi/axum_backend.rs`
 * and `src/cnc/novomation.rs`). A job the cell ran before does not end by itself, so first both channels are
 * reset (`Reset`), then the job is started (`StartJob`). It runs on the server of the app; the browser never
 * talks to the simulation itself. These are the only commands the page sends.
 */
export const startJob = createServerFn({ method: "POST" }).handler(async (): Promise<Started> => {
  const sim = simUrl()
  if (sim === null) return { started: false, error: NO_SIM_URL }
  try {
    for (const channel of CHANNELS) await send(sim, { Reset: channel })
    await new Promise((resolve) => setTimeout(resolve, AFTER_RESET_MS))
    await send(sim, { StartJob: JOB })
    return { started: true, error: null }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { started: false, error: `The simulation at ${sim} did not take the job: ${reason}.` }
  }
})
