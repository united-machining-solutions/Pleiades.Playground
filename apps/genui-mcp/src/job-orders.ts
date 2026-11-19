import { HORIZON_SECONDS } from "@pleiades/cards/machine/contract.ts"
import type { JobOrderEntry, JobOrderList } from "@pleiades/cards/machine/contract.ts"

import { readJobOrders } from "./apis.ts"
import type { Apis, StoredJobOrder } from "./apis.ts"
import { knownMachines, machineNamed } from "./machines.ts"
import { secondsBefore } from "./time.ts"

// The job orders on the lists of the machines, as the Events API puts them together from their
// events. What the retained lists of the broker say now, this says too, also to whoever opens a
// page after those lists were sent.

/**
 * An instant as an ISO 8601 string in UTC, or null. Instants compare as text only in one form:
 * the source may leave out the trailing zeros of the fraction, or write an offset.
 */
export function utc(written: string | null | undefined): string | null {
  if (!written) return null
  const at = Date.parse(written)
  return Number.isNaN(at) ? null : new Date(at).toISOString()
}

export function entryOf(stored: StoredJobOrder): JobOrderEntry {
  return {
    machine: stored.mId,
    jobOrderId: stored.jobOrderId,
    state: stored.state,
    changedAt: utc(stored.lastChange) ?? new Date(0).toISOString(),
    jobName: stored.jobName ?? null,
    workMaster: stored.workMasterId ?? null,
    orderNumbers: (stored.orderNumbers ?? []).filter((one) => one.trim() !== ""),
    runsPlanned: stored.runsPlanned ?? null,
    plannedStart: utc(stored.plannedStartTime),
    plannedEnd: utc(stored.plannedEndTime),
    start: utc(stored.startTime),
    end: utc(stored.endTime),
    produced: stored.producedQuantity ?? null,
    good: stored.goodQuantity ?? null,
    result: stored.jobResult ?? null,
  }
}

/**
 * Every job order still on the list of its machine whose last event lies in the last 24 hours,
 * of one machine or of all. One that left the list is gone, as it is from the list. One machine is
 * named by its id or as people call it (`machineNamed`).
 */
export async function listJobOrders(apis: Apis, name?: string, now = new Date()): Promise<JobOrderList> {
  const machine = name === undefined ? undefined : machineNamed(await knownMachines(apis, now), name)
  const stored = await readJobOrders(apis, secondsBefore(now, HORIZON_SECONDS), now, machine)
  const jobOrders = stored
    .filter((one) => !one.removed)
    .map(entryOf)
    .sort((a, b) => a.machine.localeCompare(b.machine) || a.changedAt.localeCompare(b.changedAt))
  return { asOf: now.toISOString(), windowSeconds: HORIZON_SECONDS, jobOrders }
}

/** The job orders in a line each, for a language model. */
export function jobOrderListInWords(list: JobOrderList): string {
  if (list.jobOrders.length === 0) return `No machine has a job order on its list (as of ${list.asOf}).`
  const lines = list.jobOrders.map((one) => {
    const numbers = one.orderNumbers.length > 0 ? `order ${one.orderNumbers.join(", ")}` : "no order number"
    const made = `${one.produced ?? 0} of ${one.runsPlanned ?? "?"} made`
    return `- ${one.machine}: job order ${one.jobOrderId} (${one.jobName ?? "no name"}), ${one.state || "state unknown"}, ${numbers}, ${made}`
  })
  return `${list.jobOrders.length} job orders on the lists of the machines (as of ${list.asOf}):\n${lines.join("\n")}`
}
