import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

import { randomId } from "./random-id.ts"

test("an id has the shape of a UUID of version 4, and no two are the same", () => {
  const ids = Array.from({ length: 200 }, () => randomId())
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(new Set(ids).size, ids.length)
})

test("an id needs only getRandomValues, which a page over plain HTTP has too", () => {
  // What a browser gives a page outside a secure context: random numbers, and no randomUUID.
  const insecure: Pick<Crypto, "getRandomValues"> = { getRandomValues: crypto.getRandomValues.bind(crypto) }
  assert.match(randomId(insecure), /^[0-9a-f-]{36}$/)
})

/** Every source file of the app below a folder, tests left out. */
function sources(folder: string): Array<string> {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

test("no file of the app calls crypto.randomUUID: a page over plain HTTP has none", () => {
  const calling = sources(import.meta.dirname).filter((path) => /crypto\s*\.\s*randomUUID\s*\(/.test(readFileSync(path, "utf8")))
  assert.deepEqual(calling, [])
})
