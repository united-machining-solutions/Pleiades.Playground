import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import type { TestContext } from "node:test"
import { pathToFileURL } from "node:url"

import { readCardFile } from "./card-file.ts"

/** An empty folder that is gone after the test. */
async function folderFor(t: TestContext) {
  const folder = await mkdtemp(join(tmpdir(), "card-files-"))
  t.after(() => rm(folder, { recursive: true }))
  return folder
}

test("a card file is read from the folder the build writes to", async (t) => {
  const folder = await folderFor(t)
  await writeFile(join(folder, "machine.html"), "<!doctype html><p>card</p>")
  assert.equal(await readCardFile("machine", pathToFileURL(`${folder}/`)), "<!doctype html><p>card</p>")
})

test("a card file that is not built says how to build it", async (t) => {
  const folder = await folderFor(t)
  await assert.rejects(
    readCardFile("machine", pathToFileURL(`${folder}/`)),
    /machine\.html is not built\. Run "pnpm --filter @pleiades\/genui-mcp build"\./,
  )
})
