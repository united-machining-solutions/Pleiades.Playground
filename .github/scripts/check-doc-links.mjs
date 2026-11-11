// SPDX-License-Identifier: Apache-2.0
//
// Checks the links inside the repository: every relative link and image of every tracked markdown file
// must point to a tracked file or folder, and an anchor must be a heading of the file it points into.
// So a file that is moved or renamed, or a heading that is reworded, cannot leave a dead pointer behind.
// Links to other sites are not checked.
//
//   node .github/scripts/check-doc-links.mjs
//
// It needs Node.js and git, and no package.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { posix } from "node:path"

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean)

/** Every tracked file, and every folder that holds one. */
const paths = new Set([""])
for (const file of tracked) {
  paths.add(file)
  for (let folder = posix.dirname(file); folder !== "."; folder = posix.dirname(folder)) paths.add(folder)
}

const read = (file) => readFileSync(posix.join(root, file), "utf8")

/** The same text with `pattern` blanked out, so that every line keeps its number. */
const blank = (text, pattern) => text.replace(pattern, (match) => match.replace(/[^\n]/g, " "))

/** Markdown without what is not read as markdown: front matter, code blocks, comments and code spans. */
function prose(text) {
  let out = blank(text, /^---\r?\n[\s\S]*?\r?\n---\r?\n/)
  out = blank(out, /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[`~]*[ \t]*$/gm)
  out = blank(out, /<!--[\s\S]*?-->/g)
  return blank(out, /(`+)[^`\n][^\n]*?\1/g)
}

/** The anchors of a markdown file as GitHub writes them: one per heading, a repeated one gets a number. */
const anchors = new Map()
function anchorsOf(file) {
  if (anchors.has(file)) return anchors.get(file)
  const found = new Set()
  const text = read(file)
  const withoutCode = blank(blank(text, /^---\r?\n[\s\S]*?\r?\n---\r?\n/), /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[`~]*[ \t]*$/gm)
  for (const [, heading] of withoutCode.matchAll(/^ {0,3}#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/gm)) {
    const words = heading
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}\p{Pc} -]/gu, "")
      .replace(/ /g, "-")
    let anchor = words
    for (let count = 1; found.has(anchor); count++) anchor = `${words}-${count}`
    found.add(anchor)
  }
  for (const [, id] of text.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) found.add(id)
  anchors.set(file, found)
  return found
}

const linkPatterns = [
  /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, // [text](target) and ![alt](target)
  /^ {0,3}\[[^\]\n]+\]:\s*<?(\S+?)>?(?:\s|$)/gm, // [name]: target
  /<(?:a|img)\s[^>]*?(?:href|src)="([^"]+)"/g, // <a href="target"> and <img src="target">
]

const problems = []
let links = 0
const files = tracked.filter((file) => file.endsWith(".md"))

for (const file of files) {
  const text = prose(read(file))
  for (const pattern of linkPatterns) {
    for (const match of text.matchAll(pattern)) {
      const target = match[1]
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) continue
      links++
      const line = text.slice(0, match.index).split("\n").length
      const report = (reason) => problems.push(`${file}:${line}: ${target}: ${reason}`)

      let path, anchor
      try {
        const [before, ...after] = target.split("#")
        path = decodeURIComponent(before)
        anchor = after.length > 0 ? decodeURIComponent(after.join("#")) : null
      } catch {
        report("is not a valid address")
        continue
      }

      const resolved =
        path === "" ? file : posix.normalize(path.startsWith("/") ? path.slice(1) : posix.join(posix.dirname(file), path))
      const there = resolved === "." ? "" : resolved.replace(/\/$/, "")
      if (there.startsWith("..") || !paths.has(there)) {
        report("no such file or folder in the repository")
        continue
      }
      if (anchor && there.endsWith(".md") && !anchorsOf(there).has(anchor)) {
        report(`no heading "${anchor}" in ${there}`)
      }
    }
  }
}

for (const problem of problems) console.error(problem)
console.log(`${links} links in ${files.length} markdown files checked, ${problems.length} broken.`)
process.exit(problems.length > 0 ? 1 : 0)
