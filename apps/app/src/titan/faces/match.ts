// Who a face is: its descriptor against the descriptors of the people who were enrolled. Plain logic,
// no browser, so that it is tested with `node --test`.

export type Descriptor = ReadonlyArray<number>

export type Person = { name: string; descriptors: ReadonlyArray<Descriptor> }

export type Match = { name: string; similarity: number }

/**
 * A face counts as a person from this similarity on. The scale is the one of Human, whose authors
 * count above 0.5 as the same face; a little more keeps a colleague from being taken for another one.
 */
export const THRESHOLD = 0.55

/** The best person must be ahead of the next one by this much, or the face counts as unknown. */
export const MARGIN = 0.04

/**
 * How alike two descriptors are, from 0 (not at all) to 1 (the same). The measure of Human
 * (`human.match.similarity`, MIT): the Euclidean distance, scaled by 25 and spread over 0.2…0.8.
 */
export function similarity(a: Descriptor, b: Descriptor): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const difference = a[i]! - b[i]!
    sum += difference * difference
  }
  if (sum === 0) return 1
  const root = Math.sqrt(25 * sum)
  const normalised = (1 - root / 100 - 0.2) / (0.8 - 0.2)
  return Math.max(0, Math.min(1, normalised))
}

/**
 * The person a descriptor belongs to, or undefined for a face nobody enrolled. A person counts with
 * their best descriptor; the best person must reach `threshold` and be clearly ahead of the next one.
 */
export function bestMatch(
  descriptor: Descriptor,
  people: ReadonlyArray<Person>,
  { threshold = THRESHOLD, margin = MARGIN }: { threshold?: number; margin?: number } = {},
): Match | undefined {
  const ranked = people
    .map((person) => ({
      name: person.name,
      similarity: Math.max(0, ...person.descriptors.map((one) => similarity(descriptor, one))),
    }))
    .sort((a, b) => b.similarity - a.similarity)
  const [best, next] = ranked
  if (!best || best.similarity < threshold) return undefined
  if (next && best.similarity - next.similarity < margin) return undefined
  return best
}
