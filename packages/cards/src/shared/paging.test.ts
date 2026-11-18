import assert from "node:assert/strict"
import { test } from "node:test"

import { pageLinks, sliceOf } from "./paging.ts"

test("a page holds its items, and a page beyond the last or below the first is the nearest that exists", () => {
  const twelve = Array.from({ length: 12 }, (_, index) => index)
  assert.deepEqual(sliceOf(twelve, 5, 2), { items: [5, 6, 7, 8, 9], page: 2, pages: 3, start: 5 })
  assert.deepEqual(sliceOf(twelve, 5, 3).items, [10, 11])
  assert.equal(sliceOf(twelve, 5, 9).page, 3)
  assert.equal(sliceOf(twelve, 5, 0).page, 1)
  assert.equal(sliceOf(twelve, 5, 2.7).page, 2)
  assert.deepEqual(sliceOf([], 5, 4), { items: [], page: 1, pages: 1, start: 0 })
})

test("many pages: the first, the current one with its neighbours, the last, and a gap between", () => {
  assert.deepEqual(pageLinks(12, 24), [1, "gap", 11, 12, 13, "gap", 24])
  assert.deepEqual(pageLinks(1, 24), [1, 2, "gap", 24])
  assert.deepEqual(pageLinks(24, 24), [1, "gap", 23, 24])
  // A gap of one page shows that page instead.
  assert.deepEqual(pageLinks(3, 24), [1, 2, 3, 4, "gap", 24])
  assert.deepEqual(pageLinks(2, 3), [1, 2, 3])
})

test("where there is little room, the pagination leaves out the neighbours of the current page", () => {
  assert.deepEqual(pageLinks(6, 12, 0), [1, "gap", 6, "gap", 12])
  assert.deepEqual(pageLinks(1, 12, 0), [1, "gap", 12])
  assert.deepEqual(pageLinks(2, 12, 0), [1, 2, "gap", 12])
  assert.deepEqual(pageLinks(3, 5, 0), [1, 2, 3, 4, 5])
})
