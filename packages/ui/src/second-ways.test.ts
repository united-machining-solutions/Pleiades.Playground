import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

// The design system has one way for each thing. The packages below are a second way for something
// a component of this package does already, on Base UI. shadcn offers them, and an agent that is
// asked for a toast reaches for one of them. This test says no, and what to take instead.

const secondWays: Record<string, string> = {
  sonner: "toast.tsx is the toast, on the Toast of Base UI",
  "next-themes": "there is one theme, and it is light",
  cmdk: "combobox.tsx searches in a list; cmdk brings Radix into a Base UI project",
  "input-otp": "otp-field.tsx is the field for a code, on the OTPField of Base UI",
  vaul: "drawer.tsx is the drawer, on the Drawer of Base UI",
}

/** Radix is the other primitive library of shadcn. This repository is on Base UI. */
const radix = /^(@radix-ui\/|radix-ui$)/

const repository = join(import.meta.dirname, "../../..")

/** Every package the workspace names: in a package.json, or in the catalog with its version. */
function namedPackages(): Map<string, string> {
  const named = new Map<string, string>()
  const files = [
    "package.json",
    ...["apps", "packages"].flatMap((folder) =>
      readdirSync(join(repository, folder), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${folder}/${entry.name}/package.json`),
    ),
  ]
  for (const file of files) {
    const manifest = JSON.parse(readFileSync(join(repository, file), "utf8")) as Record<string, unknown>
    for (const kind of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      for (const name of Object.keys((manifest[kind] as Record<string, string> | undefined) ?? {})) {
        named.set(name, file)
      }
    }
  }
  const workspace = readFileSync(join(repository, "pnpm-workspace.yaml"), "utf8")
  const catalog = workspace.slice(workspace.indexOf("\ncatalog:"))
  for (const match of catalog.matchAll(/^ {2}"?([^\s":]+)"?: /gm)) {
    if (match[1]) named.set(match[1], "pnpm-workspace.yaml")
  }
  return named
}

test("no package that is a second way for a component of this package", () => {
  const found = [...namedPackages()].flatMap(([name, file]) => {
    if (name in secondWays) return [`${name} (${file}): ${secondWays[name]}`]
    if (radix.test(name)) return [`${name} (${file}): the components here are built on Base UI`]
    return []
  })
  assert.deepEqual(found, [], "see packages/ui/README.md, \"Left out on purpose\"")
})
