import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { test } from "node:test"

// A showcase only adds. Its pages are the route files under routes/(showcases)/, and what they need is
// in a folder below this one. A build without APP_SHOWCASES leaves those routes out (vite.config.ts),
// and then nothing of a showcase is built, as long as nothing else reads from here. These tests hold
// the files of the app to that. They read the sources as text and start nothing.

const src = join(import.meta.dirname, "..")
const PAGES = "routes/(showcases)/"
const FOLDERS = "showcases/"

/** Every source file below a folder, by its path from `src/` with forward slashes. */
function sources(folder: string): Array<string> {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) ? [relative(src, path).replaceAll("\\", "/")] : []
  })
}

const read = (file: string) => readFileSync(join(src, file), "utf8")

/** The modules a file imports, as it names them. */
const imports = (text: string) => [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1] ?? "")

/** Whether a module, as a file names it, is in the folder of a showcase or among their pages. */
const ofShowcase = (module: string) => /(?:^|\/)showcases\/[^/]+\//.test(module) || module.includes("(showcases)/")

const files = sources(src)
const pages = files.filter((file) => file.startsWith(PAGES))
/** The app without its showcases: what a build without APP_SHOWCASES is made of. The generated route tree is not a source. */
const base = files.filter((file) => !file.startsWith(PAGES) && !file.startsWith(FOLDERS) && file !== "routeTree.gen.ts")

/** The address of a page from the name of its route file: `titan.faces.tsx` answers at /titan/faces. */
const addressOf = (file: string) =>
  `/${file.slice(PAGES.length).replace(/\.tsx?$/, "").replaceAll(".", "/").replace(/(^|\/)index$/, "")}`

test("there is a showcase to hold to the rule", () => {
  assert.ok(pages.length > 0, "no route file under routes/(showcases)/: if the folder moved, these tests check nothing")
})

test("nothing of the app reads from a showcase", () => {
  const wrong = base.filter((file) => imports(read(file)).some(ofShowcase))
  assert.deepEqual(wrong, [], "the app without the showcases must still build: a page of a showcase stands under routes/(showcases)/, and what the app needs too moves out of src/showcases/")
})

test("nothing of the app names the address of a page of a showcase", () => {
  // A link to a page that a build without the showcases does not have leads nowhere.
  const addresses = pages.map(addressOf).filter((address) => !address.includes("$"))
  const wrong = base.flatMap((file) => {
    const text = read(file)
    return addresses.filter((address) => new RegExp(`["'\`]${address.replaceAll("/", "\\/")}["'\`/?#]`).test(text)).map((address) => `${file}: ${address}`)
  })
  assert.deepEqual(wrong, [])
})

test("a showcase reads from its own folder only, not from another showcase", () => {
  const own = (file: string) => file.slice(FOLDERS.length).split("/")[0]
  const wrong = files
    .filter((file) => file.startsWith(FOLDERS) && file.split("/").length > 2)
    .filter((file) => imports(read(file)).some((module) => {
      const other = /(?:^|\/)showcases\/([^/]+)\//.exec(module)?.[1]
      return other !== undefined && other !== own(file)
    }))
  assert.deepEqual(wrong, [], "a showcase that is taken away must not take another one with it")
})
