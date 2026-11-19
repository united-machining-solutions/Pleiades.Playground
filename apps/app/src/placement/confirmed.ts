import type { Backing } from "../pages/store.ts"

// What became of a proposal of the chat (chat/proposed-placement.tsx), by the id of the tool call that
// proposed it: the words of what was done, and when. The chat draws a proposal again after a reload, and it
// does not offer to do a second time what a person confirmed. The notes stand in the localStorage of the
// browser under a key of their own. Another browser has none; the card then sees in the list of the sites
// that there is nothing left to do.

/** The key of the notes. A new shape gets a new key. */
export const CONFIRMED_KEY = "pleiades-playground.placements.v1"
/** The most notes kept; the oldest go first. */
export const MAX_CONFIRMED = 200

const MAX_CALL_LENGTH = 200
const MAX_WORDS_LENGTH = 400

/** What a person confirmed: what was done, in words, when, as an ISO instant, and the title of the card. */
export type Confirmed = { words: string; at: string; title?: string | undefined }

type Note = [string, Confirmed]

function isNote(entry: unknown): entry is Note {
  if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || entry[0].length > MAX_CALL_LENGTH) return false
  const done = entry[1] as Partial<Confirmed> | null
  return (
    typeof done === "object" &&
    done !== null &&
    typeof done.words === "string" &&
    done.words.length <= MAX_WORDS_LENGTH &&
    typeof done.at === "string" &&
    !Number.isNaN(Date.parse(done.at)) &&
    (done.title === undefined || (typeof done.title === "string" && done.title.length <= MAX_WORDS_LENGTH))
  )
}

function notesOf(raw: string | null | undefined): Array<Note> {
  if (!raw) return []
  try {
    const held: unknown = JSON.parse(raw)
    return Array.isArray(held) ? held.filter(isNote) : []
  } catch {
    return []
  }
}

/** The notes of one storage. The app has one, for `localStorage` (below); a test makes its own. */
export function createConfirmed(backing: () => Backing | undefined) {
  function read(): Array<Note> {
    try {
      return notesOf(backing()?.getItem(CONFIRMED_KEY))
    } catch {
      return []
    }
  }
  return {
    /** What became of the proposal of this tool call, or undefined. */
    confirmedOf(call: string): Confirmed | undefined {
      return read().find(([one]) => one === call)?.[1]
    },
    /** Notes what became of the proposal of this tool call. Says whether the storage took it. */
    keepConfirmed(call: string, done: Confirmed): boolean {
      if (call.length > MAX_CALL_LENGTH || !isNote([call, done])) return false
      const notes = [...read().filter(([one]) => one !== call), [call, done] as Note]
      try {
        const store = backing()
        store?.setItem(CONFIRMED_KEY, JSON.stringify(notes.slice(-MAX_CONFIRMED)))
        return store !== undefined
      } catch {
        return false
      }
    },
  }
}

export const { confirmedOf, keepConfirmed } = createConfirmed(() => (typeof window === "undefined" ? undefined : window.localStorage))
