import assert from "node:assert/strict"
import { test } from "node:test"
import { passageMatches, passageRanges } from "./highlight.ts"
test("marks a literal quote across native PDF spans and extraction line breaks", () => {
  assert.deepEqual(passageRanges(["Unlock the cassette", "and pull it out."], "Unlock the cassette\nand pull it out."), [
    { span: 0, start: 0, end: 19 }, { span: 1, start: 0, end: 16 },
  ])
  assert.deepEqual(passageRanges(["Un", "lock"], "Unlock"), [{ span: 0, start: 0, end: 2 }, { span: 1, start: 0, end: 4 }])
})
test("does not invent highlight coordinates for scans or nonmatching text", () => {
  assert.deepEqual(passageRanges([], "Unlock"), [])
  assert.deepEqual(passageRanges(["Different text"], "Unlock"), [])
  assert.deepEqual(passageRanges(["Text"], ""), [])
})


test("document search highlights every occurrence, including phrases across spans", () => {
  assert.deepEqual(passageMatches(["oil filter oil", "filter"], "oil filter"), [
    [{ span: 0, start: 0, end: 10 }],
    [{ span: 0, start: 11, end: 14 }, { span: 1, start: 0, end: 6 }],
  ])
  assert.deepEqual(passageRanges(["Vorher: Entriegeln\n  und herausziehen. Danach."], "Entriegeln und herausziehen."), [
    { span: 0, start: 8, end: 38 },
  ])
})
test("Unicode case folding keeps original PDF text offsets", () => {
  assert.deepEqual(passageRanges(["İ ÖL"], "ÖL"), [{ span: 0, start: 2, end: 4 }])
})
