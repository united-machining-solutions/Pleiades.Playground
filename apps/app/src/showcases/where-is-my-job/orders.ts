import type { Cluster, FloorPage, Job, JobResult } from "../../where-is-my-job/floor.ts"

// What if an order passed several machines? The stack has no such order yet: every simulator counts
// its own job orders, and no job order id or order number comes up on two machines. This showcase
// makes some up and lays them onto the real machines of the page, one job order on each machine of
// their path, all with the same order number. Their numbers begin with "WI-", for "what if", so they
// are never taken for real ones.

/** A part and the steps of manufacturing it passes, in their order. */
type Recipe = { number: string; name: string; steps: ReadonlyArray<string>; at: number }

/**
 * The made-up orders. `at` is the step the order is at now: the steps before it are through, the
 * one at it runs, those after it wait. `at` equal to the number of steps: the order is through.
 */
export const RECIPES: ReadonlyArray<Recipe> = [
  { number: "WI-1001", name: "Housing", steps: ["cutting", "milling", "grinding"], at: 1 },
  { number: "WI-1002", name: "Flange", steps: ["cutting", "grinding"], at: 1 },
  { number: "WI-1003", name: "Shaft", steps: ["turning", "milling", "grinding"], at: 2 },
  { number: "WI-1004", name: "Pin", steps: ["turning", "grinding"], at: 0 },
  { number: "WI-1005", name: "Bracket", steps: ["cutting", "forming", "joining"], at: 1 },
  { number: "WI-1006", name: "Gauge", steps: ["printing", "milling"], at: 2 },
  { number: "WI-1007", name: "Spindle sleeve", steps: ["cutting", "turning", "grinding"], at: 3 },
]

const MINUTE = 60_000
/** How long a step runs, and how long a part waits before the next. */
const STEP_MINUTES = 40
const WAIT_MINUTES = 12
const PARTS = 20

const iso = (ms: number) => new Date(ms).toISOString()

/**
 * The page with the made-up orders laid onto it. A recipe takes, for each of its steps, a machine of
 * that cluster; a step whose cluster has no machine is left out, and a recipe left with fewer than two
 * steps is no order across machines and is left out whole.
 */
export function withWhatIf(page: FloorPage, clusters: ReadonlyArray<Cluster>, now = Date.parse(page.asOf)): FloorPage {
  const machinesOf = new Map(clusters.map((one) => [one.id, one.machines]))
  const added = new Map<string, { orders: Array<Job>; results: Array<JobResult> }>()

  RECIPES.forEach((recipe, index) => {
    const path = recipe.steps.flatMap((step) => {
      const machines = machinesOf.get(step)
      return machines && machines.length > 0 ? [machines[index % machines.length]!] : []
    })
    if (path.length < 2) return
    const at = Math.min(recipe.at, path.length)
    // The step it is at started a quarter of an hour ago; the others stand before and after it.
    const startOf = (step: number) => now - 15 * MINUTE + (step - at) * (STEP_MINUTES + WAIT_MINUTES) * MINUTE

    path.forEach((machine, step) => {
      const start = startOf(step)
      const end = start + STEP_MINUTES * MINUTE
      const state = step < at ? "Ended" : step === at ? "Running" : "AllowedToStart"
      const jobOrderId = `${recipe.number}/${step + 1}`
      const lists = added.get(machine) ?? { orders: [], results: [] }
      lists.orders.push({
        jobOrderId,
        state,
        // Older than any real one, so a tile keeps showing the job order its machine really works on.
        stateSince: iso(now - 24 * 60 * MINUTE),
        jobName: recipe.name,
        workMaster: `${recipe.name} · step ${step + 1}`,
        orderNumbers: [recipe.number],
        runsPlanned: PARTS,
        plannedStart: iso(start),
        plannedEnd: iso(end),
      })
      if (step <= at && step < path.length) {
        const running = step === at
        lists.results.push({
          jobOrderId,
          start: iso(start),
          end: running ? null : iso(end),
          produced: running ? Math.round(PARTS * 0.35) : PARTS,
          good: running ? Math.round(PARTS * 0.35) : PARTS - (index % 2),
          result: running ? null : "Successful",
        })
      }
      added.set(machine, lists)
    })
  })

  const jobs = { ...page.jobs }
  for (const [machine, lists] of added) {
    const before = jobs[machine]
    jobs[machine] = {
      orders: [...(before?.orders ?? []), ...lists.orders],
      results: [...(before?.results ?? []), ...lists.results],
    }
  }
  return { ...page, jobs }
}
