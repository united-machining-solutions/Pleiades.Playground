import { written } from "../machine/format.ts"
import { labelOf } from "../machine/in-words.ts"
import { span, stamped } from "../notification/words.ts"
import type { JobOrderShow } from "./contract.ts"

// The job order card in words, for a reader that does not see it: a language model reads these lines as
// the result of the tool, and a host without cards shows them.

/** "1 job order", "2 job orders": a count with its noun. */
export function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

/** The job order in a line, by the names of the data model. */
function jobOrderInWords(job: NonNullable<JobOrderShow["jobOrder"]>, asOf: string): string {
  const name = job.jobName ? ` (${job.jobName})` : ""
  // RunsPlanned 0 plans no number of runs: then only what was produced.
  const planned = job.runsPlanned ? ` of ${job.runsPlanned}` : ""
  const made = job.produced !== null || planned ? `, ${job.produced ?? 0}${planned} produced` : ""
  const started = job.start ? `, started ${stamped(job.start, asOf)}` : ""
  const ended = job.end ? `, ended ${stamped(job.end, asOf)}` : ""
  const result = job.result && job.result !== "Unknown" ? `, JobResult ${job.result}` : ""
  return `JobOrder ${job.jobOrderId}${name}: State ${job.state || "unknown"}${started}${ended}${made}${result}.`
}

/** The program execution in a line, by the names of the data model. */
function executionInWords(run: NonNullable<JobOrderShow["programExecution"]>, asOf: string): string {
  const master = run.ActiveWorkMaster ?? "an unnamed work master"
  const of = run.JobOrderID ? ` in job order ${run.JobOrderID}` : ""
  const lasted = run.Duration !== null ? `, ${span(run.Duration)}` : ""
  const ended = run.EndTime ? ` until ${stamped(run.EndTime, asOf)}` : ""
  return `ProgramExecution of ${master}${of}: State ${run.State}, since ${stamped(run.StartTime, asOf)}${ended}${lasted}.`
}

/** The card in words: the job order, the program execution, and how many of both in the hours. */
export function jobOrderShowInWords(shown: JobOrderShow): string {
  const { asOf, from, hasMore } = shown
  const machine = `${labelOf(shown.machine)} (${shown.machine})`
  const atLeast = hasMore ? "at least " : ""
  const aborted = shown.aborted > 0 ? `, ${shown.aborted} of them aborted` : ""
  const lines = [
    `${machine}, ${stamped(from, asOf)} to ${written(asOf)}: ${atLeast}${counted(shown.jobOrders, "job order")} and ${atLeast}${counted(shown.programExecutions, "program execution")}${aborted}.`,
    shown.jobOrder ? jobOrderInWords(shown.jobOrder, asOf) : "The machine has no job order.",
    shown.programExecution ? executionInWords(shown.programExecution, asOf) : "The machine has no program execution.",
  ]
  if (hasMore) lines.push("The Events API had more than it returned: the oldest are missing and the counts are lower bounds.")
  return lines.join("\n")
}
