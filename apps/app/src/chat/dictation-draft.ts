// While dictation records, what was said so far is written down again and again, so that it stands in the
// field while one speaks: the gateway has no model that writes while one speaks. This says when the next
// draft goes out.

/**
 * A draft goes out at most this often, and only when the last one came back: a draft takes about a
 * second and a half at the gateway, which takes two requests of a key at once.
 */
export const DRAFT_EVERY_MS = 2000
/** A recording shorter than this has nothing to write down yet. */
export const DRAFT_AFTER_MS = 1000
/**
 * After this, no more drafts: each draft sends all of the recording so far, so the audio they send grows
 * with the square of its length. Thirty seconds hold a question and cost about fifteen drafts with four
 * minutes of audio; two minutes would cost forty with half an hour. Past it, the last draft stays until
 * the end, and the line under it still shows that the microphone listens.
 */
export const DRAFT_UNTIL_MS = 30_000

/** Whether the next draft goes out now. All times in milliseconds of `performance.now()`. */
export function draftIsDue(now: { at: number; since: number; last: number; busy: boolean }): boolean {
  if (now.busy) return false
  const recorded = now.at - now.since
  return recorded >= DRAFT_AFTER_MS && recorded < DRAFT_UNTIL_MS && now.at - now.last >= DRAFT_EVERY_MS
}
