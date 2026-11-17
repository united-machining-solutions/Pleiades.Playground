import { measurementList } from "@pleiades/cards/measurement/contract.ts"
import type { MeasurementList } from "@pleiades/cards/measurement/contract.ts"

import { jsonOf } from "../../chat/tool-results.ts"

// The values of the measurement card in the result of a tool call, as a chat has it. They are
// checked against the contract: what does not keep it is not drawn.

/** The measurements in the result of `genui_measurement_list`, checked against the contract of the card. */
export function measurementListOf(content: unknown): MeasurementList | null {
  const list = measurementList.safeParse(jsonOf(content))
  return list.success ? list.data : null
}
