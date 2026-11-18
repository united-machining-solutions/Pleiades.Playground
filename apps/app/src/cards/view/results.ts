import { viewShow } from "@pleiades/cards/view/contract.ts"
import type { ViewShow } from "@pleiades/cards/view/contract.ts"

import { jsonOf } from "../../chat/tool-results.ts"

// The values of a view in the result of a tool call, as a chat has it. They are checked against the
// contract: what does not keep it is not drawn.

/** The view in the result of `genui_view_show`, checked against its contract. */
export function viewShowOf(content: unknown): ViewShow | null {
  const shown = viewShow.safeParse(jsonOf(content))
  return shown.success ? shown.data : null
}
