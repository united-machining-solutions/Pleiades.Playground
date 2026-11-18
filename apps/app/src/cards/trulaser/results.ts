import { trulaserShow } from "@pleiades/cards/trulaser/contract.ts"
import type { TrulaserShow } from "@pleiades/cards/trulaser/contract.ts"

import { jsonOf } from "../../chat/tool-results.ts"

// The values of the TruLaser card in the result of a tool call, as a chat has it. They are checked
// against the contract: what does not keep it is not drawn.

/** The values in the result of `genui_trulaser_show`, checked against the contract of the card. */
export function trulaserShowOf(content: unknown): TrulaserShow | null {
  const shown = trulaserShow.safeParse(jsonOf(content))
  return shown.success ? shown.data : null
}
