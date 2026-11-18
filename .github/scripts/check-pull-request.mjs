// SPDX-License-Identifier: Apache-2.0
//
// Checks that a pull request says what it is, where CONTRIBUTING.md asks for it and a file cannot:
//
// - the title is a Conventional Commit, because it becomes the commit on main;
// - the text says what and why, and what was verified: the template is filled in;
// - a change to a contract links its issue;
// - a `feat`, a `fix` or a breaking change (`!`) has its line in CHANGELOG.md, or says why not.
//
// Each thing that is missing comes with what to do about it, so whoever reads the failure can act
// on it: a person, or the agent that is asked to fix the check.
//
//   node .github/scripts/check-pull-request.mjs <number>
//
// It needs Node.js and the GitHub CLI (gh), signed in, and no package.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

const TEMPLATE = new URL("../PULL_REQUEST_TEMPLATE.md", import.meta.url)

export const TYPES = ["build", "chore", "ci", "docs", "feat", "fix", "perf", "refactor", "revert", "style", "test"]

/** `type(scope)!: what changes`: the scope and the mark of a breaking change are optional. */
const conventional = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9][a-z0-9./-]*\\))?(!)?: \\S`)

/** The types whose change a reader of the changelog looks for. */
const NOTABLE = ["feat", "fix"]

const withoutComments = (markdown) => markdown.replace(/<!--[\s\S]*?-->/g, "")

/** The lines under each `## heading` of a text, without comments and without empty lines. A line keeps its indent. */
function sections(markdown) {
  const found = new Map()
  let lines
  for (const line of withoutComments(markdown).split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading) found.set(heading[1].toLowerCase(), (lines = []))
    else if (line.trim()) lines?.push(line.trimEnd())
  }
  return found
}

/** A line of a checklist without its box: the same whether it is ticked or not. */
const unboxed = (line) => line.replace(/^- \[[ xX]\]\s*/, "")

/**
 * What a pull request does not say yet, each with what to do about it. None if it says everything.
 *
 * `pullRequest` is its number, its title, its text and the paths of the files it changes.
 * `template` is the text of the pull request template: what a text looks like that nobody filled in.
 */
export function problemsOf({ number, title, body, files }, template) {
  const problems = []
  const said = sections(body ?? "")
  const blank = sections(template)
  const type = conventional.exec(title)
  const edit = `gh pr edit ${number}`

  if (!type) {
    problems.push({
      problem: `The title is not a Conventional Commit: "${title}"`,
      fix: [
        "It becomes the commit on main. Write it as type(scope): what changes, in lower case, the scope",
        'only if there is one. For example "fix(timeseries-persistence): reject numbers without unit".',
        `The types: ${TYPES.join(", ")}.`,
        `${edit} --title "<type>(<scope>): <what changes>"`,
      ],
    })
  }

  if (!said.get("what and why")?.length) {
    problems.push({
      problem: 'Nothing stands under "What and why".',
      fix: ["One or two sentences: what changes, and why. Link the issue if there is one."],
      inText: true,
    })
  }

  const verified = said.get("how it was verified")
  const untouched = new Set(blank.get("how it was verified")?.map((line) => line.trim()))
  // What "Not verified" says may also stand below it, as a list of its own.
  const silent = verified?.findIndex((line) => /^- \[[xX]\] Not verified:?$/.test(line)) ?? -1
  if (!verified?.some((line) => !untouched.has(line.trim()))) {
    problems.push({
      problem: verified
        ? '"How it was verified" is the template as it came: nothing is ticked and nothing is said.'
        : 'The text has no section "How it was verified".',
      fix: [
        "Tick what you ran. On a line that does not apply, say why after a colon. After",
        '"Not verified:" say what you could not check, and why.',
      ],
      inText: true,
    })
  } else if (silent !== -1 && !/^\s/.test(verified[silent + 1] ?? "")) {
    problems.push({
      problem: '"Not verified" is ticked and does not say what.',
      fix: [
        "Say after the colon, or in a list below it, what you could not check and why. If there is",
        "nothing, take the tick away.",
      ],
      inText: true,
    })
  }

  const contracts = files.filter((file) => file.startsWith("contracts/"))
  if (contracts.length > 0 && !/#\d+|\/issues\/\d+/.test(withoutComments(body ?? ""))) {
    problems.push({
      problem: `A contract changes (${contracts.join(", ")}) and the text links no issue.`,
      fix: [
        "CONTRIBUTING.md asks for an issue first when a contract changes, so that everyone who reads or",
        'writes through it can answer. Open one with the form "Contract change", then link it under',
        '"What and why" as #<number>.',
        'gh issue create --template "Contract change"',
      ],
      inText: true,
    })
  }

  if (type && (NOTABLE.includes(type[1]) || type[3]) && !files.includes("CHANGELOG.md")) {
    // The line of the checklist about the changelog, and what the text added to it.
    const line = blank.get("checklist")?.find((one) => one.includes("CHANGELOG.md"))
    const stem = line && unboxed(line)
    const lines = said.get("checklist")?.map((one) => unboxed(one.trim()))
    const why = stem && lines?.find((one) => one.startsWith(stem) && /\w/.test(one.slice(stem.length)))
    if (!why) {
      problems.push({
        problem: `The title says "${type[1]}${type[3] ?? ""}", and CHANGELOG.md has no line for it.`,
        fix: [
          "Add a line under [Unreleased] of CHANGELOG.md, in the same pull request. If the change is",
          "not one a reader of the changelog looks for, say why on its line of the checklist:",
          `- [ ] ${stem ?? "`CHANGELOG.md` updated for a notable change"}: <why not>`,
        ],
      })
    }
  }

  return problems
}

/** The problems as a text for whoever has to do something about them. */
export function report(number, problems) {
  if (problems.length === 0) return `Pull request ${number} says what it is.`
  const things = problems.length === 1 ? "One thing" : `${problems.length} things`
  // How the text of a pull request is changed, said once for every problem that is in the text.
  const text = [
    `\nTo change the text: write it to a file, from \`gh pr view ${number} --json body --jq .body\` or from`,
    `.github/PULL_REQUEST_TEMPLATE.md, then: gh pr edit ${number} --body-file <file>`,
  ]
  return [
    `Pull request ${number} does not say yet what it is. ${things} to do:`,
    ...problems.map(({ problem, fix }, index) => [`\n${index + 1}. ${problem}`, ...fix.map((line) => `   ${line}`)].join("\n")),
    ...(problems.some((one) => one.inText) ? text : []),
    `\nThen run this again, or let CI: node .github/scripts/check-pull-request.mjs ${number}`,
  ].join("\n")
}

/** The pull request as GitHub has it now, asked through the GitHub CLI. */
function read(number) {
  const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const { title, body } = JSON.parse(gh("pr", "view", number, "--json", "title,body"))
  // Every changed file, also of a pull request with more of them than one page of the API holds.
  const files = gh("api", "--paginate", `repos/{owner}/{repo}/pulls/${number}/files`, "--jq", ".[].filename")
  return { number, title, body, files: files.split("\n").filter(Boolean) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [number] = process.argv.slice(2)
  if (!/^\d+$/.test(number ?? "")) {
    console.error("Usage: node .github/scripts/check-pull-request.mjs <number of the pull request>")
    process.exit(2)
  }
  let pullRequest
  try {
    pullRequest = read(number)
  } catch {
    // The GitHub CLI has said why, in the line above. This is no answer about the pull request.
    console.error(`Could not read pull request ${number} through the GitHub CLI (gh). Nothing was checked.`)
    process.exit(2)
  }
  const problems = problemsOf(pullRequest, readFileSync(fileURLToPath(TEMPLATE), "utf8"))
  console.log(report(number, problems))
  process.exitCode = problems.length === 0 ? 0 : 1
}
