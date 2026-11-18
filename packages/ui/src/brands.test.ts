import assert from "node:assert/strict"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

// A brand changes how the user interface looks, never what it says. So a brand is one rule that sets
// tokens of the theme, and only the ones below. The colour of an error, of a chart and of a state of
// a machine mean the same in every brand, and a brand that set one would be told so here.

const mayBeSet = new Set([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "border",
  "input",
  "ring",
  "radius",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  "font-sans",
])

const folder = join(import.meta.dirname, "../brands")
const ids = readdirSync(folder, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
const stylesheet = readFileSync(join(folder, "brands.css"), "utf8")
const list = readFileSync(join(folder, "brands.ts"), "utf8")

test("there is a brand to test", () => {
  assert.notEqual(ids.length, 0, "packages/ui/brands holds no brand")
})

for (const id of ids) {
  test(`the brand "${id}" has its DESIGN.md, is one rule and is in both lists`, () => {
    assert.match(id, /^[a-z][a-z0-9-]*$/, "a brand is named in lower case, with digits and hyphens")
    assert.ok(existsSync(join(folder, id, "DESIGN.md")), "a brand is written from its DESIGN.md")
    assert.ok(stylesheet.includes(`@import "./${id}/theme.css";`), "brands.css imports its theme.css")
    assert.ok(list.includes(`id: "${id}"`), "brands.ts names it")

    const theme = readFileSync(join(folder, id, "theme.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@import [^;]+;/g, "")
      .trim()
    const rule = /^([^{}]+)\{([^{}]*)\}$/.exec(theme)
    assert.ok(rule, "theme.css is one rule, after the imports of its fonts")
    assert.equal(rule[1]?.trim(), `:root[data-brand="${id}"]`, "the rule holds while <html> carries the brand")
  })

  test(`the brand "${id}" sets tokens of the theme, and no colour that carries a meaning`, () => {
    const theme = readFileSync(join(folder, id, "theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
    const body = theme.slice(theme.indexOf("{") + 1, theme.lastIndexOf("}"))
    const set = body
      .split(";")
      .map((declaration) => declaration.split(":")[0]?.trim() ?? "")
      .filter(Boolean)
    const others = set.filter((property) => !property.startsWith("--") || !mayBeSet.has(property.slice(2)))
    assert.deepEqual(others, [], "see packages/ui/brands/README.md, \"What a brand may set\"")
  })
}
