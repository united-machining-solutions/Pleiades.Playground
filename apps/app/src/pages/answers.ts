import type { RecipePart } from "./recipe.ts"
import { asks } from "./shown-parts.ts"

// The answers a page has drawn, kept by what each part asks, as `shownParts` finds them. An answer
// stands until a newer one of the same part comes, so a page that is read again keeps standing
// while it waits, and a part that keeps failing does not take the others with it.

/** An answer, and the number of the question it answers: a later question has a higher number. */
export type Held<TAnswered> = { answered: TAnswered; question: number }

/**
 * The answers with this one. It replaces the answer of the same part unless that one answers a
 * later question: answers may come in another order than they were asked.
 */
export function withAnswer<TAnswered extends RecipePart>(
  held: ReadonlyMap<string, Held<TAnswered>>,
  answered: TAnswered,
  question: number,
): ReadonlyMap<string, Held<TAnswered>> {
  const what = asks(answered)
  const before = held.get(what)
  if (before !== undefined && before.question > question) return held
  return new Map(held).set(what, { answered, question })
}
