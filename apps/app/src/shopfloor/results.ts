import { shopfloorShow } from "@pleiades/cards/shopfloor/contract.ts"
import type { ShopfloorShow } from "@pleiades/cards/shopfloor/contract.ts"

import { jsonOf } from "../chat/tool-results.ts"

// The values of the shop floor card in the result of a tool call, as a chat has it. They are checked
// against the contract: what does not keep it is not drawn.

/** The values of the shop floor card in the result of `genui_shopfloor_show`, checked against its contract. */
export function shopfloorShowOf(content: unknown): ShopfloorShow | null {
  const shown = shopfloorShow.safeParse(jsonOf(content))
  return shown.success ? shown.data : null
}
