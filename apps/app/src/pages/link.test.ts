import assert from "node:assert/strict"
import { test } from "node:test"

import { MAX_PARAM_LENGTH, OPEN_PATH, RECIPE_PARAM, decodeRecipe, encodeRecipe, linkOf } from "./link.ts"
import { MAX_ARGS_LENGTH, MAX_PARTS, MAX_TITLE_LENGTH } from "./recipe.ts"
import type { Recipe } from "./recipe.ts"

const recipe: Recipe = {
  title: "Morning round",
  parts: [
    { tool: "genui_machine_list", args: {} },
    { tool: "genui_machine_show", args: { machine: "P-04", hours: 8 } },
  ],
}

/** What a link of somebody else could hold: any text as the parameter, written the way the app writes one. */
/** Whether the router would turn a parameter into a value: it does, for any text that is JSON. */
const isJson = (text: string) => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

const written = (text: string) => Buffer.from(text, "utf8").toString("base64url")

test("a recipe written into a parameter and read back is the same recipe", () => {
  const text = encodeRecipe(recipe)
  assert.notEqual(text, null)
  assert.deepEqual(decodeRecipe(text), recipe)
})

test("a title and arguments outside ASCII survive the way", () => {
  const other: Recipe = {
    title: "Frühschicht – Schleifmaschinen 磨削 🙂",
    parts: [{ tool: "genui_machine_show", args: { machine: "Ä-04", note: "Überstunden \"ja\" / \\ ✓", nested: { list: [1, null, "ö"] } } }],
  }
  assert.deepEqual(decodeRecipe(encodeRecipe(other)), other)
})

test("the text is safe in an address: base64url alone, no padding, and never JSON for the router", () => {
  // Titles of every length: the three endings of base64, and the characters that become `-` and `_`.
  let swapped = 0
  for (let length = 1; length < 40; length += 1) {
    const read: Recipe = { ...recipe, title: "~?>".repeat(length).slice(0, length) }
    const text = encodeRecipe(read) ?? ""
    assert.match(text, /^[A-Za-z0-9_-]+$/)
    assert.equal(text, Buffer.from(JSON.stringify(read), "utf8").toString("base64url"))
    assert.equal(isJson(text), false, `"${text}" would be turned into a value by the router`)
    if (/[-_]/.test(text)) swapped += 1
  }
  assert.ok(swapped > 0, "no title reached a character that base64 writes differently")
})

test("a recipe is trimmed as a recipe is: a link carries what a page keeps", () => {
  assert.equal(decodeRecipe(encodeRecipe({ ...recipe, title: "  Morning round \n" }))?.title, "Morning round")
})

test("a value that is not a recipe is not written", () => {
  assert.equal(encodeRecipe({ title: "", parts: recipe.parts }), null)
  assert.equal(encodeRecipe({ title: "x", parts: [] }), null)
  assert.equal(encodeRecipe({ title: "x", parts: [{ tool: "t", args: { timeZone: "Europe/Zurich" } }] }), null)
})

test("a recipe with the most parts and the longest title the schema takes still has a link, when the arguments are short", () => {
  const full: Recipe = {
    title: "t".repeat(MAX_TITLE_LENGTH),
    parts: Array.from({ length: MAX_PARTS }, (_, index) => ({ tool: "genui_machine_show", args: { machine: `P-${index}`, hours: 24 } })),
  }
  const text = encodeRecipe(full)
  assert.notEqual(text, null)
  assert.ok((text ?? "").length < MAX_PARAM_LENGTH / 2)
  assert.deepEqual(decodeRecipe(text), full)
})

test("a recipe that would give a text beyond the cap has no link", () => {
  const long: Recipe = {
    title: "Everything",
    parts: Array.from({ length: MAX_PARTS }, () => ({ tool: "genui_machine_show", args: { note: "n".repeat(MAX_ARGS_LENGTH - 100) } })),
  }
  assert.equal(encodeRecipe(long), null)
  assert.equal(linkOf(long, "https://app.example"), null)
})

test("a text beyond the cap is not read, even where it is a recipe", () => {
  // JSON allows blanks after the value, so this is a recipe, only longer than a link may be.
  const padded = JSON.stringify(recipe) + " ".repeat(MAX_PARAM_LENGTH)
  assert.deepEqual(decodeRecipe(written(JSON.stringify(recipe))), recipe)
  assert.equal(decodeRecipe(written(padded)), null)
  assert.equal(decodeRecipe("A".repeat(MAX_PARAM_LENGTH + 1)), null)
})

test("nonsense is no recipe", () => {
  for (const text of ["", " ", "a", "ab", "abc", "!!!", "eyJ", "not a recipe", "e30", "bnVsbA", "W10", "MTIz"]) {
    assert.equal(decodeRecipe(text), null, JSON.stringify(text))
  }
})

test("only base64url is read: the other base64, padding and blanks are not", () => {
  const text = written(JSON.stringify(recipe))
  assert.notEqual(decodeRecipe(text), null)
  assert.equal(decodeRecipe(`${text}=`), null)
  assert.equal(decodeRecipe(` ${text}`), null)
  assert.equal(decodeRecipe(`${text}\n`), null)
  // The same bytes in the other base64 have a `+` or a `/` in them, and are not read.
  const plain = Buffer.from(JSON.stringify({ ...recipe, title: "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~" }), "utf8").toString("base64")
  assert.match(plain, /[+/]/)
  assert.equal(decodeRecipe(plain), null)
})

test("what is not a string is not read", () => {
  // The router turns a parameter that looks like JSON into a value, so a hand-made link can bring any of these.
  for (const value of [undefined, null, 123, true, {}, [], [written(JSON.stringify(recipe))], recipe]) {
    assert.equal(decodeRecipe(value), null, JSON.stringify(value))
  }
})

test("text that is not UTF-8 or not JSON is no recipe", () => {
  assert.equal(decodeRecipe(Buffer.from([0xff, 0xfe, 0xfd, 0x7b]).toString("base64url")), null)
  assert.equal(decodeRecipe(written(JSON.stringify(recipe).slice(0, -3))), null)
  assert.equal(decodeRecipe(written("{'title': 'x'}")), null)
  // A valid recipe with one byte of a character cut in the middle of it.
  assert.equal(decodeRecipe(Buffer.concat([Buffer.from(JSON.stringify(recipe)), Buffer.from([0xc3])]).toString("base64url")), null)
})

test("JSON that is not a recipe is no recipe", () => {
  const part = { tool: "genui_machine_show", args: { machine: "P-04" } }
  const broken: ReadonlyArray<unknown> = [
    null,
    [],
    "Morning round",
    {},
    { title: "x" },
    { parts: [part] },
    { title: "", parts: [part] },
    { title: "   ", parts: [part] },
    { title: "x".repeat(MAX_TITLE_LENGTH + 1), parts: [part] },
    { title: 4, parts: [part] },
    { title: "x", parts: [] },
    { title: "x", parts: part },
    { title: "x", parts: Array.from({ length: MAX_PARTS + 1 }, () => part) },
    { title: "x", parts: [{ args: {} }] },
    { title: "x", parts: [{ tool: "", args: {} }] },
    { title: "x", parts: [{ tool: 4, args: {} }] },
    { title: "x", parts: [{ tool: "t", args: [] }] },
    { title: "x", parts: [{ tool: "t", args: "P-04" }] },
    { title: "x", parts: [{ tool: "t", args: { timeZone: "Europe/Zurich" } }] },
    { title: "x", parts: [{ tool: "t", args: { note: "n".repeat(MAX_ARGS_LENGTH) } }] },
  ]
  for (const value of broken) assert.equal(decodeRecipe(written(JSON.stringify(value))), null, JSON.stringify(value))
})

test("arguments nested without end are no recipe, and nothing walks them", () => {
  const deep = `${"[".repeat(3_000)}${"]".repeat(3_000)}`
  assert.equal(decodeRecipe(written(`{"title":"x","parts":[{"tool":"t","args":{"deep":${deep}}}]}`)), null)
})

test("a key `__proto__` in the arguments sets no prototype: it is left out, and nothing is polluted", () => {
  const read = decodeRecipe(written('{"title":"x","parts":[{"tool":"t","args":{"__proto__":{"admin":true},"machine":"P-04"}}]}'))
  const args = read?.parts[0]?.args
  assert.deepEqual(args, { machine: "P-04" })
  assert.equal(Object.getPrototypeOf(args), Object.prototype)
  assert.equal(({} as Record<string, unknown>).admin, undefined)
})

test("what a link carries beyond the recipe is left out, and nothing in it says where to go", () => {
  const read = decodeRecipe(written(JSON.stringify({ ...recipe, redirect: "https://evil.example/", to: "/machines/P-04" })))
  assert.deepEqual(read, recipe)
})

test("the link is absolute, with the origin it is given, and leads to the route that opens a link", () => {
  for (const origin of ["https://app.example", "http://localhost:5600", "http://127.0.0.1:3017"]) {
    const link = linkOf(recipe, origin)
    assert.notEqual(link, null)
    const url = new URL(link ?? "")
    assert.equal(url.origin, origin)
    assert.equal(url.pathname, OPEN_PATH)
    assert.deepEqual([...url.searchParams.keys()], [RECIPE_PARAM])
    assert.deepEqual(decodeRecipe(url.searchParams.get(RECIPE_PARAM)), recipe)
    assert.equal(url.hash, "")
  }
})

test("the route of a link is not the route of a kept page: its ids are twelve hex digits", () => {
  assert.equal(/^\/pages\/[0-9a-f]{12}$/.test(OPEN_PATH), false)
})
