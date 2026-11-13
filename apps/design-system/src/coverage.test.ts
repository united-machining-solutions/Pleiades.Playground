import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

// The page shows every component of packages/ui, so that nobody builds one that is there. This
// test reads the files of both and compares: a component that is added to packages/ui fails it
// until it has a block here. (The shadcn skill has a script for this, showcase-coverage.mjs. It
// looks for imports that end in "/ui/<name>", the path of an application that keeps its
// components in a folder of its own, so it finds none of the imports of this workspace.)

const here = import.meta.dirname
const components = join(here, "../../../packages/ui/src/components")

/** The source of the page: every .tsx file under src/. */
function page(): string {
  return readdirSync(here, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8"))
    .join("\n")
}

test("every component of packages/ui has a block on the page", () => {
  const source = page()
  const names = readdirSync(components)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => file.replace(/\.tsx$/, ""))
  assert.ok(names.length > 0, `no component found under ${components}`)

  const notImported = names.filter((name) => !source.includes(`from "@pleiades/ui/components/${name}"`))
  const withoutBlock = names.filter((name) => !source.includes(`file="${name}"`))
  assert.deepEqual(
    { notImported, withoutBlock },
    { notImported: [], withoutBlock: [] },
    "give each of these a block in its section, see apps/design-system/README.md",
  )
})
