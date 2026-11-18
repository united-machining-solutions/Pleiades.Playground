import { siteList } from "@pleiades/cards/site/contract.ts"
import type { SiteList } from "@pleiades/cards/site/contract.ts"

import { jsonOf } from "../../chat/tool-results.ts"

// The values of the site card in the result of a tool call, as a chat has it. They are checked
// against the contract: what does not keep it is not drawn.

/** The sites in the result of `genui_site_list`, checked against the contract of the card. */
export function siteListOf(content: unknown): SiteList | null {
  const list = siteList.safeParse(jsonOf(content))
  return list.success ? list.data : null
}
