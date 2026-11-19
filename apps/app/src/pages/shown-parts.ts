import type { RecipePart } from "./recipe.ts"

// A kept page is asked once, by its loader, and can change afterwards: a part removed, moved or put
// back. The page then shows the parts as the recipe has them now, each with the answer it already
// has, so that nothing is asked again only because another part moved or went. A part is known by
// what it asks, its tool and its arguments: a part that asks the same is the same answer.

/** A part of the recipe as it is now, with a key that stays with it when it moves, and its answer if the page has one. */
export type ShownPart<TAnswered> = { key: string; part: RecipePart; answered: TAnswered | undefined }

/** What a part asks: its tool and its arguments, as JSON. The arguments keep their order from the store. */
export function asks(part: RecipePart): string {
  return `${part.tool} ${JSON.stringify(part.args)}`
}

/**
 * The parts of a recipe as it is now, in its order, each with the answer of the part that asks the
 * same among those the loader answered. A part the loader did not answer has none: it was put back
 * after the page was read again, or changed in another tab. The key is what the part asks and how
 * many parts before it ask the same, so it stays with the part while the page changes and when it
 * is read again.
 */
export function shownParts<TAnswered extends RecipePart>(
  parts: ReadonlyArray<RecipePart>,
  answered: ReadonlyArray<TAnswered>,
): Array<ShownPart<TAnswered>> {
  const answers = new Map<string, TAnswered>()
  for (const one of answered) if (!answers.has(asks(one))) answers.set(asks(one), one)
  const before = new Map<string, number>()
  return parts.map((part) => {
    const what = asks(part)
    const same = before.get(what) ?? 0
    before.set(what, same + 1)
    return { key: `${same} ${what}`, part, answered: answers.get(what) }
  })
}
