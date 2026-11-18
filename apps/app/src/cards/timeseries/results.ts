import { timeseriesShow } from "@pleiades/cards/timeseries/contract.ts"
import type { TimeseriesShow } from "@pleiades/cards/timeseries/contract.ts"

import { jsonOf } from "../../chat/tool-results.ts"

// The values of the time series card in the result of a tool call, as a chat has it. They are checked
// against the contract: what does not keep it is not drawn.

/** The lines in the result of `genui_timeseries_show`, checked against the contract of the card. */
export function timeseriesShowOf(content: unknown): TimeseriesShow | null {
  const shown = timeseriesShow.safeParse(jsonOf(content))
  return shown.success ? shown.data : null
}
