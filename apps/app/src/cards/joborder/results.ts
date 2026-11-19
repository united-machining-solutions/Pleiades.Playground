import { jobOrderShow } from "@pleiades/cards/joborder/contract.ts"
import type { JobOrderShow } from "@pleiades/cards/joborder/contract.ts"

import { jsonOf } from "../../chat/tool-results.ts"

// The values of the job order card in the result of a tool call, as a chat has them. They are checked
// against the contract: what does not keep it is not drawn.

/** The job order in the result of `genui_job_order_show`, checked against the contract of the card. */
export function jobOrderShowOf(content: unknown): JobOrderShow | null {
  const shown = jobOrderShow.safeParse(jsonOf(content))
  return shown.success ? shown.data : null
}
