import assert from "node:assert/strict"
import { test } from "node:test"
import { documentationAnswerOf } from "./contract.ts"

const documentId = "a".repeat(64), revision = "b".repeat(64)
const evidence = { documentId, revision, packageName: "LS-3000", path: "manual.pdf", page: 112, pageLabel: "110", method: "text", documentType: "manufacturer", title: "Manual LS-3000", shortTitle: "Manual LS-3000", chapter: null, version: null, quote: "Unlock the cassette.", citation: "manual.pdf, page 110", resourceUri: `docs://documents/${documentId}/${revision}/pages/112` }
const value = { kind: "documentation-answer", status: "supported", answer: ["Unlock the cassette."], warnings: ["WARNING Laser radiation."], evidence }
test("one validated evidence survives MCP and harness representations", () => {
  for (const content of [value, JSON.stringify(value), [{ type: "text", text: JSON.stringify(value) }], [{ type: "text", content: JSON.stringify(value) }]]) {
    assert.deepEqual(documentationAnswerOf(content), value)
  }
})
test("no multiple sources, unsafe links, mismatched pages or unknown document categories", () => {
  for (const source of [[evidence, evidence], { ...evidence, resourceUri: "https://attacker.test" }, { ...evidence, page: 113 }, { ...evidence, documentType: "other" }]) {
    assert.equal(documentationAnswerOf({ ...value, evidence: source }), null)
  }
  assert.equal(documentationAnswerOf({ ...value, evidence: null }), null)
})
test("an unavailable answer has no invented evidence or warning", () => {
  const missing = { kind: "documentation-answer", status: "unavailable", answer: ["No supporting passage found."], warnings: [], evidence: null }
  assert.deepEqual(documentationAnswerOf(missing), missing)
  assert.equal(documentationAnswerOf({ ...missing, evidence }), null)
})

test("conflicts retain all alternatives, including same-category and same-page sources", () => {
  const alternative = (quote: string) => ({ statement: quote, evidence: { ...evidence, documentType: "customer", quote } })
  const review = { state: "conflict", complete: true, explanation: "Three local instructions disagree.", conflicts: [{
    topic: "Replacement interval", alternatives: [alternative("Replace every 120 hours."), alternative("Replace every 200 hours."), alternative("Replace every 300 hours.")],
    resolution: { rule: "stricter_compatible", reason: "Comparable maximum intervals.", recommendedIndex: 0 },
  }] }
  assert.ok(documentationAnswerOf({ ...value, review }))
  const invalid = [
    { ...review, complete: false },
    { ...review, state: "no_conflict" },
    { ...review, conflicts: [] },
    { ...review, conflicts: [{ ...review.conflicts[0], resolution: { ...review.conflicts[0].resolution, recommendedIndex: 3 } }] },
    { ...review, conflicts: [{ ...review.conflicts[0], resolution: { ...review.conflicts[0].resolution, rule: "clarification" } }] },
    { ...review, conflicts: [{ ...review.conflicts[0], alternatives: [alternative("Same quote"), alternative("Same quote")] }] },
    { ...review, conflicts: [{ ...review.conflicts[0], alternatives: [alternative("One"), { statement: "Other", evidence: { ...evidence, packageName: "Other machine" } }] }] },
  ]
  for (const bad of invalid) assert.equal(documentationAnswerOf({ ...value, review: bad }), null)
  const partial = { ...review, complete: false, conflicts: [{ ...review.conflicts[0], resolution: { rule: "clarification", reason: "Indexing is incomplete.", recommendedIndex: null } }] }
  assert.ok(documentationAnswerOf({ ...value, review: partial }))
})
test("no contradiction and incomplete review states cannot falsely claim coverage", () => {
  assert.ok(documentationAnswerOf({ ...value, review: { state: "no_conflict", complete: true, explanation: "Compared retrieved passages.", conflicts: [] } }))
  assert.ok(documentationAnswerOf({ ...value, review: { state: "incomplete", complete: false, explanation: "Missing review.", conflicts: [] } }))
  assert.equal(documentationAnswerOf({ ...value, review: { state: "no_conflict", complete: false, explanation: "Missing review.", conflicts: [] } }), null)
  assert.equal(documentationAnswerOf({ ...value, review: { state: "incomplete", complete: true, explanation: "Missing review.", conflicts: [] } }), null)
})

test("separately cited safety warnings retain their own verified PDF page", () => {
  const warning = "WARNING Use the approved safe-access procedure."
  const safety = { ...evidence, page: 2, pageLabel: "2", quote: warning, resourceUri: `docs://documents/${documentId}/${revision}/pages/2` }
  const warningSources = [{ text: warning, evidence: safety }]
  assert.ok(documentationAnswerOf({ ...value, warnings: [warning], warningSources }))
  assert.equal(documentationAnswerOf({ ...value, warnings: [warning], warningSources: [{ text: "Altered warning", evidence: safety }] }), null)
  assert.equal(documentationAnswerOf({ ...value, warnings: [], warningSources }), null)
  assert.equal(documentationAnswerOf({ ...value, warnings: [warning], warningSources: [{ text: warning, evidence: { ...safety, packageName: "Other machine" } }] }), null)
})
