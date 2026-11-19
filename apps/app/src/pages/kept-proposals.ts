import type { Backing } from "./store.ts"

// Which page a proposal of the chat was kept as (chat/proposed-page.tsx), by the id of the tool call
// that proposed it. A kept page can be renamed and its parts changed, so its recipe no longer says
// which proposal it came from; this link does, also after a reload, and a proposal that was kept does
// not offer to keep a second page. The links stand in the localStorage of the browser under a key of
// their own, beside the pages: they are no page, and the pages do not change for them. A link to a page
// that was deleted since is simply not found among the pages.

/** The key of the links. A new shape gets a new key. */
export const KEPT_PROPOSALS_KEY = "pleiades-playground.proposals.v1"
/** The most links kept; the oldest go first. A chat that was kept that long ago is gone from the server. */
export const MAX_KEPT_PROPOSALS = 200

/** An id of a page, as a stored page has it, and of a tool call, as a provider writes it. */
const PAGE_ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_CALL_LENGTH = 200

/** The links in what the storage holds, a list of pairs: those that are a call and a page, oldest first. */
function linksOf(raw: string | null | undefined): Array<[string, string]> {
  if (!raw) return []
  let held: unknown
  try {
    held = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(held)) return []
  return held.filter(
    (entry: unknown): entry is [string, string] =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === "string" &&
      entry[0].length <= MAX_CALL_LENGTH &&
      typeof entry[1] === "string" &&
      PAGE_ID.test(entry[1]),
  )
}

/** The links of one storage. The app has one, for `localStorage` (below); a test makes its own. */
export function createKeptProposals(backing: () => Backing | undefined) {
  function read(): Array<[string, string]> {
    try {
      return linksOf(backing()?.getItem(KEPT_PROPOSALS_KEY))
    } catch {
      return []
    }
  }
  return {
    /** The page the proposal of this tool call was kept as, or undefined. */
    keptPageOf(call: string): string | undefined {
      return read().find(([one]) => one === call)?.[1]
    },
    /** Notes that the proposal of this tool call was kept as this page. Says whether the storage took it. */
    keepProposal(call: string, page: string): boolean {
      if (call.length > MAX_CALL_LENGTH || !PAGE_ID.test(page)) return false
      const links = [...read().filter(([one]) => one !== call), [call, page] as [string, string]]
      try {
        backing()?.setItem(KEPT_PROPOSALS_KEY, JSON.stringify(links.slice(-MAX_KEPT_PROPOSALS)))
        return backing() !== undefined
      } catch {
        return false
      }
    },
  }
}

export const { keptPageOf, keepProposal } = createKeptProposals(() =>
  typeof window === "undefined" ? undefined : window.localStorage,
)
