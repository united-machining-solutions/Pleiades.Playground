import type { SiteList } from "@pleiades/cards/site/contract.ts"

import { Refused, ask, textOf } from "../machines/get-machines.ts"

// The list of the sites for the tool of the chat, on the server of the app: the same answer of
// genui_site_list as Home reads (machines/get-machines.ts), on the same connection.

/** The sites, or throws the sentence of why there are none. */
export async function readSites(): Promise<SiteList> {
  const answer = await ask(async (backend) => {
    const result = await backend.callTool("genui_site_list", {})
    if (result.isError || !result.structuredContent) throw new Refused(textOf(result) ?? "genui_site_list returned no values.")
    return result.structuredContent
  })
  if (answer.values === null) throw new Error(answer.error)
  return answer.values
}
