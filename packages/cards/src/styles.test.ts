import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

// A card file carries the styles of exactly the shadcn/ui components the cards draw. styles.css
// names them for Tailwind, one line each. This test reads the imports and compares, so a card that
// draws a new component cannot leave it without its styles.

const here = import.meta.dirname
const components = join(here, "../../ui/src/components")

/** The components a file imports from packages/ui. */
function importsOf(file: string): Array<string> {
  return [...readFileSync(file, "utf8").matchAll(/from "@pleiades\/ui\/components\/([a-z-]+)"/g)].flatMap(
    (match) => match[1] ?? [],
  )
}

function componentFilesUnder(folder: string): Array<string> {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => join(entry.parentPath, entry.name))
}

test("styles.css names every shadcn/ui component a card draws, and no other", () => {
  // A component can be built from others, a button group from a separator: those are drawn too.
  const drawn = new Set<string>()
  const open = componentFilesUnder(here).flatMap(importsOf)
  for (let name = open.pop(); name !== undefined; name = open.pop()) {
    if (drawn.has(name)) continue
    drawn.add(name)
    open.push(...importsOf(join(components, `${name}.tsx`)))
  }

  const named = [
    ...readFileSync(join(here, "styles.css"), "utf8").matchAll(
      /^@source "\.\.\/\.\.\/ui\/src\/components\/([a-z-]+)\.tsx";$/gm,
    ),
  ].map((match) => match[1])

  assert.deepEqual(named, [...drawn].sort())
})
