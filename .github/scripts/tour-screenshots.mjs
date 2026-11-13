// SPDX-License-Identifier: Apache-2.0
//
// Takes the screenshots of the tour (docs/tour.md) from the running demo stack and writes them under
// docs/images/tour/, each 1280 × 800 pixels in the light theme. So a picture is retaken with one command,
// and every retake has the same size.
//
//   node .github/scripts/tour-screenshots.mjs                    every picture
//   node .github/scripts/tour-screenshots.mjs home swagger-ui    only these
//
// It needs the stack running (docker compose up -d --wait), the packages of the workspace (pnpm install)
// and the browser of Playwright (pnpm exec playwright install chromium).
//
// What a run does to the stack:
// - "chat-answer" asks the language model of the chat one question, at the cost of the owner of its key.
//   Without a language model the two pictures of the chat are left out, and the run says so.
// - "home-no-data" stops the simulator of one machine for about a minute and starts it again.
//
// The simulator changes the states on its own, so two runs do not give the same picture: look at what a
// run wrote, and describe in docs/tour.md what the new picture shows. The picture of the card in another
// host is taken by hand, see the end of docs/tour.md.

import { execFileSync } from "node:child_process"
import { statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../..", import.meta.url))
const out = join(root, "docs", "images", "tour")
const viewport = { width: 1280, height: 800 }
/** A picture of the tour stays below this size, so the repository stays light. */
const LIMIT_BYTES = 500_000

/** The machine of the stops "The page of one machine" and "The chat beside the page". */
const SHOWN = "P-04"
/** The question of the stop "The chat beside the page". */
const QUESTION = `What did ${SHOWN} do over the last 8 hours?`
/** How long a language model may take for its answer, tool calls included. */
const ANSWER_TIMEOUT = 120_000
/** The machine of the stop "When a machine goes silent", and the service that simulates it. */
const SILENT = { machine: "M-02", service: "simulator-m-02" }
/** A machine counts as silent after 30 seconds, and Home reads again every ten: two minutes are plenty. */
const SILENCE_TIMEOUT = 120_000

function fail(message) {
  console.error(message)
  process.exit(1)
}

const compose = (...args) =>
  execFileSync("docker", ["compose", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

/** Where a service of the stack answers on this computer. Compose is asked, because `.env` may move a port. */
function addressOf(service) {
  let published
  try {
    published = compose("port", service, "8080").trim().split("\n")[0]
  } catch {
    fail(`The service "${service}" does not run. Start the stack first: docker compose up -d --wait`)
  }
  return `http://localhost:${published.slice(published.lastIndexOf(":") + 1)}`
}

/** Opens a page with the chat panel at its start. Answers why the chat cannot be shown, if it cannot. */
async function openChat(page, url) {
  await page.goto(`${url}?chat=new`)
  const field = page.getByRole("textbox", { name: "Message" })
  const none = page.getByText("No language model configured")
  await field.or(none).first().waitFor()
  return (await none.isVisible()) ? "no language model is configured" : undefined
}

/**
 * The pictures, in the order they are taken. `show` brings the page to what the picture shows, and answers
 * with a reason where it cannot; `after` puts the stack back.
 *
 * The order matters twice. The model picker comes before the question, so that the list of chats in its
 * picture is as the person left it. And the picture that stops a simulator comes last, so that the others
 * show the stack as it runs.
 */
const pictures = [
  {
    name: "home",
    async show(page, at) {
      await page.goto(at.app)
      await page.getByText("· live · now").waitFor()
    },
  },
  {
    name: "machine-page",
    async show(page, at) {
      await page.goto(`${at.app}/machines/${SHOWN}`)
      await page.getByRole("heading", { name: SHOWN }).waitFor()
      await page.getByText(/^Last (hour|\d+ hours)$/).waitFor()
    },
  },
  {
    name: "chat-model-picker",
    async show(page, at) {
      const reason = await openChat(page, at.app)
      if (reason) return reason
      const picker = page.getByRole("button", { name: /^Model: / })
      // The field offers a choice only when the settings name more than one model.
      if ((await picker.count()) === 0) return "the chat has one model, so it offers no choice"
      await picker.click()
      await page.getByRole("menuitemradio").first().waitFor()
    },
  },
  {
    name: "chat-answer",
    async show(page, at) {
      const reason = await openChat(page, `${at.app}/machines/${SHOWN}`)
      if (reason) return reason
      console.log(`  asking the language model: ${QUESTION}`)
      const field = page.getByRole("textbox", { name: "Message" })
      await field.fill(QUESTION)
      await field.press("Enter")
      // The chat is busy from the question until the end of the answer.
      const chat = page.getByLabel("Chat", { exact: true })
      await chat.locator('[aria-busy="true"]').waitFor()
      await chat.locator('[aria-busy="false"]').waitFor({ timeout: ANSWER_TIMEOUT })
      if (await chat.getByRole("alert").count()) throw new Error("The language model did not answer, see the chat.")
    },
  },
  {
    name: "swagger-ui",
    async show(page, at) {
      await page.goto(at.timeseries)
      await page.locator(".swagger-ui .opblock").first().waitFor()
    },
  },
  {
    name: "home-no-data",
    async show(page, at) {
      console.log(`  stopping ${SILENT.service}, then waiting until Home shows ${SILENT.machine} without data`)
      compose("stop", SILENT.service)
      await page.goto(at.app)
      await page
        .getByRole("listitem")
        .filter({ hasText: SILENT.machine })
        .filter({ hasText: "No data" })
        .waitFor({ timeout: SILENCE_TIMEOUT })
    },
    after() {
      compose("start", SILENT.service)
      console.log(`  started ${SILENT.service} again`)
    },
  },
]

const names = pictures.map((picture) => picture.name)
const asked = process.argv.slice(2)
const unknown = asked.filter((name) => !names.includes(name))
if (unknown.length > 0) fail(`No picture named ${unknown.join(", ")}. The pictures are: ${names.join(", ")}.`)
const wanted = pictures.filter((picture) => asked.length === 0 || asked.includes(picture.name))

const { chromium } = await import("playwright").catch(() => fail("Playwright is not installed. Run: pnpm install"))
const at = { app: addressOf("app"), timeseries: addressOf("timeseries-api") }
const browser = await chromium.launch().catch((error) => {
  if (String(error).includes("Executable doesn't exist")) {
    fail("The browser of Playwright is not installed. Run: pnpm exec playwright install chromium")
  }
  throw error
})

const written = []
const leftOut = []
const tooLarge = []
try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "light" })
  const page = await context.newPage()
  for (const picture of wanted) {
    const file = join(out, `${picture.name}.png`)
    console.log(`${picture.name}.png`)
    try {
      const reason = await picture.show(page, at)
      if (reason) {
        leftOut.push(picture.name)
        console.log(`  left out: ${reason}`)
        continue
      }
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: file, animations: "disabled" })
    } finally {
      picture.after?.()
    }
    const bytes = statSync(file).size
    written.push(picture.name)
    if (bytes > LIMIT_BYTES) tooLarge.push(picture.name)
    console.log(`  ${viewport.width} × ${viewport.height}, ${Math.round(bytes / 1000)} kB`)
  }
} finally {
  await browser.close()
}

console.log(`Wrote ${written.length} of ${wanted.length} pictures to docs/images/tour/.`)
if (leftOut.length > 0) console.log(`Left out: ${leftOut.join(", ")}.`)
if (tooLarge.length > 0) fail(`Over 500 kB: ${tooLarge.join(", ")}. Take it again, or show less in it.`)
if (written.length > 0) console.log("Look at each picture before you commit it: it shows your stack, your chats included.")
