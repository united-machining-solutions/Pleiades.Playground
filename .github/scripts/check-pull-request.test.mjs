// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { problemsOf, report } from "./check-pull-request.mjs"

const template = readFileSync(new URL("../PULL_REQUEST_TEMPLATE.md", import.meta.url), "utf8")

/** The template with one of its parts replaced: `from` is a text of the template, `to` what stands there instead. */
const filled = (...changes) => changes.reduce((text, [from, to]) => {
  assert.ok(text.includes(from), `the template no longer says: ${from}`)
  return text.replace(from, to)
}, template)

const why = ["<!-- One or two sentences. Link the issue if there is one. -->", "A page lists the programs."]
const ran = ["- [ ] `pnpm typecheck`", "- [x] `pnpm typecheck`"]

const check = (pullRequest) =>
  problemsOf({ number: 7, title: "docs: a page", body: filled(why, ran), files: ["docs/page.md"], ...pullRequest }, template)
      .map((one) => one.problem)

test("a pull request that says everything has nothing to do", () => {
  assert.deepEqual(check({}), [])
  assert.equal(report(7, []), "Pull request 7 says what it is.")
})

test("the title is a Conventional Commit, with or without a scope", () => {
  for (const title of ["feat(app): a page", "fix: a thing", "docs(agents): a recipe", "refactor(genui-mcp)!: a break", "ci: a check"]) {
    assert.deepEqual(check({ title, files: ["CHANGELOG.md"] }), [], title)
  }
  for (const title of ["Feat/programs and live values", "feat(App): a page", "feature: a page", "feat:a page", "Add a page"]) {
    assert.match(check({ title })[0] ?? "", /^The title is not a Conventional Commit/, title)
  }
})

test("the template as it came says nothing", () => {
  assert.deepEqual(check({ body: template }), [
    'Nothing stands under "What and why".',
    '"How it was verified" is the template as it came: nothing is ticked and nothing is said.',
  ])
  // As GitHub sends a text that was written in the browser.
  assert.equal(check({ body: template.replaceAll("\n", "\r\n") }).length, 2)
  assert.deepEqual(check({ body: "" }), ['Nothing stands under "What and why".', 'The text has no section "How it was verified".'])
  assert.equal(check({ body: null }).length, 2)
})

test("what was verified is a tick, or a line that says why it does not apply", () => {
  assert.deepEqual(check({ body: filled(why, ran) }), [])
  // No tick, and a reason after the colon: also an answer.
  const notRun = [" (if `apps/` or `packages/` are affected)", ": not run, no file under `apps/` or `packages/` changed"]
  assert.deepEqual(check({ body: filled(why, notRun) }), [])
  assert.deepEqual(check({ body: filled(why, ["<!-- say what and why -->", "the same on macOS"]) }), [])
})

test('"Not verified" says what', () => {
  const ticked = ["- [ ] Not verified:", "- [x] Not verified:"]
  assert.deepEqual(check({ body: filled(why, ticked) }), ['"Not verified" is ticked and does not say what.'])
  assert.deepEqual(check({ body: filled(why, ticked, ["<!-- say what and why -->", "in a browser"]) }), [])
  // What it says may stand below it, as a list of its own.
  const below = ["<!-- say what and why -->", "\n  - The page in a browser.\n  - The same on macOS."]
  assert.deepEqual(check({ body: filled(why, ticked, below) }), [])
})

test("a change to a contract links its issue", () => {
  const files = ["contracts/mcp/README.md", "apps/genui-mcp/src/server.ts"]
  assert.deepEqual(check({ files }), ["A contract changes (contracts/mcp/README.md) and the text links no issue."])
  assert.deepEqual(check({ files, body: filled([why[0], "Closes #60: a topic family."], ran) }), [])
  assert.deepEqual(check({ files, body: filled([why[0], "See https://github.com/example/example/issues/60."], ran) }), [])
  // A number inside a comment of the template links nothing.
  assert.equal(check({ files, body: filled([why[0], "A tool more. <!-- #60 -->"], ran) }).length, 1)
})

test("a feat, a fix or a breaking change has its line in the changelog, or says why not", () => {
  const files = ["apps/app/src/routes/programs.tsx"]
  assert.deepEqual(check({ title: "feat(app): a page", files }), ['The title says "feat", and CHANGELOG.md has no line for it.'])
  assert.deepEqual(check({ title: "refactor!: a break", files }), ['The title says "refactor!", and CHANGELOG.md has no line for it.'])
  assert.deepEqual(check({ title: "feat(app): a page", files: [...files, "CHANGELOG.md"] }), [])
  // What a reader of the changelog does not look for needs no line.
  for (const title of ["docs: a page", "test(app): a case more", "refactor(app): one file less", "ci: a check"]) {
    assert.deepEqual(check({ title, files }), [], title)
  }
  const line = "- [ ] `CHANGELOG.md` updated for a notable change"
  assert.deepEqual(check({ title: "fix(app): a typo", files, body: filled(why, ran, [line, `${line}: a typo in a label`]) }), [])
  assert.deepEqual(check({ title: "fix(app): a typo", files, body: filled(why, ran, [line, line.replace("[ ]", "[x]")]) }).length, 1)
})

test("the report says what to do, with the number of the pull request", () => {
  const text = report(93, problemsOf({ number: 93, title: "Feat/programs and live values", body: template, files: ["contracts/mcp/README.md"] }, template))
  assert.match(text, /^Pull request 93 does not say yet what it is\. 4 things to do:/)
  assert.match(text, /gh pr edit 93 --title/)
  assert.match(text, /gh pr edit 93 --body-file <file>/)
  assert.match(text, /gh issue create --template "Contract change"/)
  assert.match(report(93, [{ problem: "One.", fix: [] }]), /One thing to do:/)
})
