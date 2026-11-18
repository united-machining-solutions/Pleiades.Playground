import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join, posix, relative } from "node:path"
import { test } from "node:test"

// A showcase only adds. Its pages are the route files under routes/(showcases)/, and what they need is
// in a folder below this one. A build without APP_SHOWCASES leaves those routes out (vite.config.ts),
// and then nothing of a showcase is built, as long as nothing else reads from here. These tests hold
// the files of the app to that. They read the sources as text and start nothing.

const src = join(import.meta.dirname, "..")
const PAGES = "routes/(showcases)/"
const FOLDERS = "showcases/"
const SOURCE = /\.[cm]?[jt]sx?$/

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

/**
 * What a file imports, by the paths from `src/` the modules resolve to: `@/` is `src/` (tsconfig.json), and
 * `./` and `../` start at the folder of the file. A package is left out. So `../where-is-my-job/data.ts`,
 * written in `showcases/titan/`, is `showcases/where-is-my-job/data.ts`, as `@/showcases/where-is-my-job/data.ts` is.
 */
const targets = (file: string) =>
  imports(read(file)).flatMap((module) => {
    if (module.startsWith("@/")) return [posix.normalize(module.slice(2))]
    if (module.startsWith("./") || module.startsWith("../")) return [posix.join(posix.dirname(file), module)]
    return []
  })

/**
 * The showcase a path from `src/` belongs to, or nothing for the app. A folder `showcases/<name>/` is one
 * showcase. A page belongs to the showcase its name begins with: `(showcases)/titan.tsx`,
 * `(showcases)/titan.faces.tsx` and `(showcases)/titan/faces.tsx` are pages of `showcases/titan/`.
 * A file directly in `showcases/`, as this one, is of no showcase.
 */
function showcaseOf(path: string): string | undefined {
  if (path.startsWith(PAGES)) return path.slice(PAGES.length).split(/[/.]/)[0]
  if (!path.startsWith(FOLDERS)) return undefined
  const [name = "", ...below] = path.slice(FOLDERS.length).split("/")
  return below.length > 0 || !SOURCE.test(name) ? name : undefined
}

const files = sources(src)
const pages = files.filter((file) => file.startsWith(PAGES))
/** The app without its showcases: what a build without APP_SHOWCASES is made of. The generated route tree is not a source. */
const base = files.filter((file) => !file.startsWith(PAGES) && !file.startsWith(FOLDERS) && file !== "routeTree.gen.ts")
/** The files of the showcases: their pages and what is in their folders. */
const ofShowcases = files.filter((file) => showcaseOf(file) !== undefined)

/** The address of a page from the name of its route file: `titan.faces.tsx` answers at /titan/faces. */
const addressOf = (file: string) =>
  `/${file.slice(PAGES.length).replace(/\.tsx?$/, "").replaceAll(".", "/").replace(/(^|\/)index$/, "")}`

test("there is a showcase to hold to the rule", () => {
  assert.ok(pages.length > 0, "no route file under routes/(showcases)/: if the folder moved, these tests check nothing")
})

test("nothing of the app reads from a showcase", () => {
  const wrong = base.flatMap((file) => targets(file).filter((path) => showcaseOf(path) !== undefined).map((path) => `${file}: ${path}`))
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

test("a showcase reads from its own folder and pages only, not from another showcase", () => {
  const wrong = ofShowcases.flatMap((file) => {
    const own = showcaseOf(file)
    return targets(file)
      .filter((path) => {
        const other = showcaseOf(path)
        return other !== undefined && other !== own
      })
      .map((path) => `${file}: ${path}`)
  })
  assert.deepEqual(
    wrong,
    [],
    "a showcase that is taken away must not take another one with it. A page belongs to the showcase its name begins with: (showcases)/<name>.tsx, (showcases)/<name>.<more>.tsx and (showcases)/<name>/ read from showcases/<name>/",
  )
})
