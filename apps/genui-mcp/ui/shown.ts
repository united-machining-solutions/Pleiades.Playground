// What a card file draws for a result the host sends: the values of its card, or a sentence. Every
// card file asks the same, so it stands here once. This file imports nothing, so a test can use it.

/** A result as the host sends it. */
export type Result = { isError?: boolean; content?: ReadonlyArray<unknown>; structuredContent?: unknown }

/** The values of the card, or a sentence where the result holds none. */
export type Shown<TValues> = { values: TValues } | { note: string }

/** Anything that checks values against a contract, as a zod schema does. */
type Contract<TValues> = { safeParse: (value: unknown) => { success: true; data: TValues } | { success: false } }

/**
 * The values of a result, checked against the contract of the card; else what the tool said where
 * it failed, or that the result is not `card`, for example "a machine card".
 */
export function shownFor<TValues>(result: Result, contract: Contract<TValues>, card: string): Shown<TValues> {
  const values = contract.safeParse(result.structuredContent)
  if (values.success) return { values: values.data }
  // A tool that failed says why in its first block of text.
  const [first] = result.content ?? []
  const said = typeof first === "object" && first !== null && "text" in first ? first.text : undefined
  return { note: result.isError && typeof said === "string" ? said : `This result is not ${card}.` }
}
