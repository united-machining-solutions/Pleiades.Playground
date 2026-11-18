import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { COLOURS, categoryColour } from "./colour.ts"

test("a category takes the colour of its place, the first --chart-1", () => {
  assert.equal(categoryColour(0), "var(--chart-1)")
  assert.equal(categoryColour(COLOURS - 1), `var(--chart-${COLOURS})`)
})

test("after the last colour the colours begin again, as the cards had it", () => {
  assert.equal(categoryColour(COLOURS), "var(--chart-1)")
})

test("dataviz.css names as many colours as the cards count", () => {
  const css = readFileSync(new URL("../dataviz.css", import.meta.url), "utf8")
  const named = new Set([...css.matchAll(/--chart-(\d+):/g)].map((match) => Number(match[1])))
  assert.equal(named.size, COLOURS)
})
