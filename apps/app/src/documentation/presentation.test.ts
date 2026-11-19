import assert from "node:assert/strict"
import { test } from "node:test"
import { answerCardInstructions, withDocumentationScope } from "./presentation.ts"
test("documentation answers always require cards even with an obsolete presentation setting", () => {
  for (const settings of [{}, { APP_DOCUMENTATION_ANSWER_CARDS: "false" }]) {
    assert.match(answerCardInstructions(settings), /exactly one docs_answer/)
    assert.match(answerCardInstructions(settings), /never fall back to unverified prose/)
    assert.throws(() => withDocumentationScope("docs_search", { query: "glass" }, settings), /Select a documentation package/)
  }
})
test("configured machine package overrides untrusted model package choices", () => {
  const settings = { APP_DOCUMENTATION_PACKAGE: "LS-3000" }
  assert.deepEqual(withDocumentationScope("docs_search", { query: "glass", packageName: "Other" }, settings), { query: "glass", packageName: "LS-3000" })
  assert.deepEqual(withDocumentationScope("docs_review", { packageName: "Other", terms: ["origin"] }, settings), { packageName: "LS-3000", terms: ["origin"] })
  assert.deepEqual(withDocumentationScope("docs_answer", { packageName: "Other" }, settings), { packageName: "LS-3000" })
  assert.throws(() => withDocumentationScope("docs_search", { query: "glass" }, {}), /Select a documentation package/)
})


test("unknown packages trigger metadata discovery before an unavailable answer", () => {
  const instructions = answerCardInstructions({})
  assert.match(instructions, /first call docs_list_packages/)
  assert.match(instructions, /sole package in a complete listing/)
  assert.match(instructions, /Only ask.*ambiguous/)
  assert.match(instructions, /Never perform an unscoped content search/)
  assert.deepEqual(withDocumentationScope("docs_list_packages", {}, {}), {})
  assert.throws(() => withDocumentationScope("docs_search", { query: "AA-L2-07" }, {}), /docs_list_packages/)
  assert.doesNotMatch(answerCardInstructions({ APP_DOCUMENTATION_PACKAGE: "HypCut" }), /first call docs_list_packages/)
})
