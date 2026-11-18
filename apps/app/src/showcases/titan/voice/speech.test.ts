import assert from "node:assert/strict"
import { test } from "node:test"

import { MAX_SENTENCE, speakableText } from "./speech.ts"

test("a sentence is spoken trimmed, with single spaces", () => {
  assert.equal(speakableText("  P-04 steht\n still.  "), "P-04 steht still.")
})

test("nothing, an empty text or no text at all is not spoken", () => {
  assert.equal(speakableText("   "), undefined)
  assert.equal(speakableText(undefined), undefined)
  assert.equal(speakableText(42), undefined)
})

test("a text longer than a sentence may be is not spoken", () => {
  assert.equal(speakableText("a".repeat(MAX_SENTENCE)), "a".repeat(MAX_SENTENCE))
  assert.equal(speakableText("a".repeat(MAX_SENTENCE + 1)), undefined)
})
