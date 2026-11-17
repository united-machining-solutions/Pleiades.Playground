import assert from "node:assert/strict"
import { test } from "node:test"

import { bestMatch, similarity } from "./match.ts"

/** A descriptor of 1024 values, like the ones of the model, each `value` but the first `at`. */
function descriptor(value: number, at = 0, first = value): Array<number> {
  return Array.from({ length: 1024 }, (_, index) => (index < at ? first : value))
}

test("a descriptor is the same as itself", () => {
  assert.equal(similarity(descriptor(0.1), descriptor(0.1)), 1)
})

test("descriptors of different length are not alike", () => {
  assert.equal(similarity([0.1, 0.2], [0.1]), 0)
  assert.equal(similarity([], []), 0)
})

test("the similarity falls with the distance and stays between 0 and 1", () => {
  const near = similarity(descriptor(0), descriptor(0.2))
  const far = similarity(descriptor(0), descriptor(0.3))
  assert.ok(near > far, `${near} > ${far}`)
  assert.ok(near <= 1 && far >= 0)
  assert.equal(similarity(descriptor(0), descriptor(1)), 0)
})

test("the closest person is the match", () => {
  const people = [
    { name: "Anna", descriptors: [descriptor(0), descriptor(0.02)] },
    { name: "Ben", descriptors: [descriptor(0.6)] },
  ]
  assert.equal(bestMatch(descriptor(0.05), people)?.name, "Anna")
  assert.equal(bestMatch(descriptor(0.55), people)?.name, "Ben")
})

test("a person counts with their best descriptor", () => {
  const people = [
    { name: "Anna", descriptors: [descriptor(0.9), descriptor(0)] },
    { name: "Ben", descriptors: [descriptor(0.3)] },
  ]
  assert.equal(bestMatch(descriptor(0), people)?.name, "Anna")
})

test("a face far from everyone is unknown", () => {
  const people = [{ name: "Anna", descriptors: [descriptor(0)] }]
  assert.equal(bestMatch(descriptor(0.4), people), undefined)
})

test("a face between two people is unknown", () => {
  const people = [
    { name: "Anna", descriptors: [descriptor(0, 512, 0.2)] },
    { name: "Ben", descriptors: [descriptor(0.2, 512, 0)] },
  ]
  assert.equal(bestMatch(descriptor(0.1), people), undefined)
})

test("nobody enrolled, nobody recognised", () => {
  assert.equal(bestMatch(descriptor(0), []), undefined)
})
