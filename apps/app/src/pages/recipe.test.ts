import assert from "node:assert/strict"
import { test } from "node:test"

import { MAX_ARGS_LENGTH, MAX_PARTS, MAX_TITLE_LENGTH, recipeOf, recipeSchema, storedPageSchema, titleOf } from "./recipe.ts"

const show = { tool: "genui_machine_show", args: { machine: "P-04" } }
const recipe = { title: "Morning round", parts: [{ tool: "genui_machine_list", args: {} }, show] }

test("a title and parts, each a tool with its arguments, are a recipe", () => {
  assert.deepEqual(recipeOf(recipe), recipe)
})

test("a tool the app does not know is still a part: the page says that it has no answer", () => {
  const other = { title: "Alarms", parts: [{ tool: "genui_alarm_list", args: { hours: 24 } }] }
  assert.deepEqual(recipeOf(other), other)
})

test("a title keeps no mark that turns the direction of the text", () => {
  const turned = recipeOf({ title: "Mixed parts\u202Eevil", parts: [{ tool: "genui_machine_list", args: {} }] })
  assert.equal(turned?.title, "Mixed partsevil")
})

test("the title is trimmed, and an empty or too long one is refused", () => {
  assert.equal(recipeOf({ ...recipe, title: "  Morning round \n" })?.title, "Morning round")
  assert.equal(recipeOf({ ...recipe, title: "   " }), null)
  assert.equal(recipeOf({ ...recipe, title: "x".repeat(MAX_TITLE_LENGTH) })?.title.length, MAX_TITLE_LENGTH)
  assert.equal(recipeOf({ ...recipe, title: "x".repeat(MAX_TITLE_LENGTH + 1) }), null)
})

test("a page has at least one part and at most the cap", () => {
  assert.equal(recipeOf({ ...recipe, parts: [] }), null)
  assert.equal(recipeOf({ ...recipe, parts: Array.from({ length: MAX_PARTS }, () => show) })?.parts.length, MAX_PARTS)
  assert.equal(recipeOf({ ...recipe, parts: Array.from({ length: MAX_PARTS + 1 }, () => show) }), null)
})

test("the arguments are a plain JSON object", () => {
  for (const args of [[], "P-04", 4, null, undefined, { at: new Date() }, { what: () => 1 }]) {
    assert.equal(recipeOf({ ...recipe, parts: [{ tool: "genui_machine_show", args }] }), null, String(args))
  }
  const nested = { machine: "P-04", window: { hours: 8, states: ["running", null] } }
  assert.deepEqual(recipeOf({ ...recipe, parts: [{ tool: "genui_machine_show", args: nested }] })?.parts[0]?.args, nested)
})

test("the arguments keep no time zone: the app adds the one of the person who opens the page", () => {
  const zoned = { tool: "genui_machine_show", args: { machine: "P-04", timeZone: "Europe/Zurich" } }
  assert.equal(recipeOf({ ...recipe, parts: [zoned] }), null)
})

test("the arguments of a part are capped, and nothing large is walked", () => {
  const long = { tool: "genui_machine_show", args: { machine: "x".repeat(MAX_ARGS_LENGTH) } }
  assert.equal(recipeOf({ ...recipe, parts: [long] }), null)
  let deep: unknown = 1
  for (let level = 0; level < 100_000; level += 1) deep = [deep]
  assert.equal(recipeOf({ ...recipe, parts: [{ tool: "genui_machine_show", args: { deep } }] }), null)
})

test("a tool has a name, of a capped length", () => {
  assert.equal(recipeOf({ ...recipe, parts: [{ tool: "", args: {} }] }), null)
  assert.equal(recipeOf({ ...recipe, parts: [{ tool: "t".repeat(101), args: {} }] }), null)
  assert.equal(recipeOf({ ...recipe, parts: [{ args: {} }] }), null)
})

test("what a recipe does not know is left out", () => {
  assert.deepEqual(recipeSchema.parse({ ...recipe, author: "Liliane" }), recipe)
})

test("a stored page is a recipe with an id that fits an address, a version, a pin and when it was saved", () => {
  const page = { id: "3f2a9c1e0b7d", version: 1, recipe, pinned: true, savedAt: "2026-11-17T08:03:00.000Z" }
  assert.deepEqual(storedPageSchema.parse(page), page)
  assert.equal(storedPageSchema.safeParse({ ...page, id: "../machines" }).success, false)
  assert.equal(storedPageSchema.safeParse({ ...page, version: 0 }).success, false)
  assert.equal(storedPageSchema.safeParse({ ...page, savedAt: "yesterday" }).success, false)
  assert.equal(storedPageSchema.safeParse({ ...page, pinned: "yes" }).success, false)
})

test("a question becomes a title on one line, cut where it is too long", () => {
  assert.equal(titleOf("  How were P-04 and\nP-07 overnight? "), "How were P-04 and P-07 overnight?")
  const cut = titleOf("word ".repeat(100))
  assert.equal(cut.length <= MAX_TITLE_LENGTH, true)
  assert.equal(cut.endsWith("…"), true)
  assert.notEqual(recipeOf({ ...recipe, title: cut }), null)
  assert.equal(titleOf(" \n "), "")
})
