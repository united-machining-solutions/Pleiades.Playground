import assert from "node:assert/strict"
import { test } from "node:test"

import { versionOf } from "./app-version.ts"

const revision = "7a83c2f0d4b1e5a6c9f8e7d6c5b4a3f2e1d0c9b8"
const source = "https://github.com/united-machining-solutions/Pleiades.Playground"

test("an image of the workflow names its version and commit, and links to the commit", () => {
  assert.deepEqual(versionOf({ version: "0.0.142", revision, source }), {
    label: "0.0.142 · 7a83c2f",
    href: `${source}/commit/${revision}`,
  })
})

test("vite dev in a checkout names the commit, and links nowhere without the repository", () => {
  assert.deepEqual(versionOf({ version: "dev", revision, source: "" }), {
    label: "dev · 7a83c2f",
    href: undefined,
  })
})

test("a build that knows no commit is only its version", () => {
  assert.deepEqual(versionOf({ version: "dev", revision: "", source }), {
    label: "dev",
    href: undefined,
  })
})
