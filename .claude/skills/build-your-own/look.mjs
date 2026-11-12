// What the running stack has, on one screen. It only reads, and it needs Node.js 18 or newer and
// nothing else, so it runs before anything is installed.
//
//   node .claude/skills/build-your-own/look.mjs                         the overview
//   node .claude/skills/build-your-own/look.mjs call <tool> [key=value]  one tool of the generative UI backend
//
// The ports are those of .env.example. If yours differ, set the same names in the shell.
import { readdirSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const port = (name, usual) => process.env[name] ?? usual
const at = {
  timeseries: `http://localhost:${port("TIMESERIES_API_PORT", 5500)}`,
  events: `http://localhost:${port("EVENTS_API_PORT", 5510)}`,
  genui: `http://localhost:${port("GENUI_MCP_PORT", 5520)}`,
  app: `http://localhost:${port("APP_PORT", 5600)}`,
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const get = (url) => fetch(url, { signal: AbortSignal.timeout(8000) })

async function mcp(method, params) {
  const answer = await fetch(`${at.genui}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  })
  const text = await answer.text()
  // The server answers as JSON or as one server-sent event.
  const json = text.startsWith("{") ? text : (text.split("\n").find((line) => line.startsWith("data: ")) ?? "").slice(6)
  const message = JSON.parse(json)
  if (message.error) throw new Error(message.error.message)
  return message.result
}

/** Runs one part of the overview. A part that cannot be read says so and does not stop the rest. */
async function part(title, url, read) {
  console.log(`\n${title}`)
  try {
    await read()
  } catch (error) {
    console.log(`  not readable at ${url} (${error.cause?.code ?? error.message})`)
    console.log("  Does the stack run? A port may be changed in .env: ask the person, do not open the file.")
  }
}

function pages() {
  const routes = join(root, "apps", "app", "src", "routes")
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [relative(routes, join(dir, entry.name))],
    )
  for (const file of walk(routes).filter((name) => name.endsWith(".tsx") && name !== "__root.tsx").sort()) {
    const path = file.replace(/\.tsx$/, "").replace(/\\/g, "/").replace(/\./g, "/").replace(/(^|\/)index$/, "")
    console.log(`  /${path}`.padEnd(28) + `apps/app/src/routes/${file.replace(/\\/g, "/")}`)
  }
}

async function answers() {
  const { tools } = await mcp("tools/list")
  for (const tool of tools) {
    const onlyACard = tool._meta?.ui?.visibility?.join() === "app"
    const says = tool.description.split(/(?<=\.)\s/)[0]
    console.log(`  ${tool.name}${onlyACard ? "  (only a card calls it)" : ""}\n      ${says}`)
  }
}

async function values() {
  const to = new Date()
  const from = new Date(to.getTime() - 10 * 60 * 1000)
  const found = await (await get(`${at.timeseries}/topics?startTime=${from.toISOString()}&stopTime=${to.toISOString()}`)).json()
  const kindOf = { baseUnitTopics: "number", stringTopics: "string", booleanTopics: "boolean" }
  const machines = new Set()
  const paths = new Map()
  for (const [kind, topics] of Object.entries(found)) {
    for (const topic of topics) {
      const machine = /^machines\/([^/]+)\/(.+)$/.exec(topic)
      if (machine) machines.add(machine[1])
      paths.set(machine ? machine[2] : topic, kindOf[kind] ?? kind)
    }
  }
  console.log(`  ${paths.size} different topics in the last ten minutes. Machines: ${[...machines].sort().join(", ") || "none"}`)
  console.log("  Below machines/{SerialNumber}/, or in full where a topic is not about a machine:")
  for (const [path, kind] of [...paths].sort()) console.log(`    ${path.padEnd(64)} ${kind}`)
}

async function notifications() {
  const to = new Date()
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
  const url = `${at.events}/notificationEvents/statistics/levelDistribution?from=${from.toISOString()}&to=${to.toISOString()}`
  const levels = await (await get(url)).json()
  console.log(`  in the last 24 hours: ${levels.map((one) => `${one.count} ${one.level}`).join(", ") || "none"}`)
  console.log(`  Each of them: GET ${at.events}/notificationEvents with from, to, level and mId (the machine).`)
}

async function chat() {
  const { status } = await get(`${at.app}/api/harness/sessions`)
  if (status === 200) console.log("  a language model is set: the chat answers")
  else if (status === 503) console.log("  no language model is set: the chat cannot answer. Pages and cards work without one.")
  else console.log(`  the app answered ${status}`)
}

async function call(tool, pairs) {
  const value = (text) => (/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text === "true" ? true : text === "false" ? false : text)
  const args = Object.fromEntries(pairs.map((pair) => [pair.slice(0, pair.indexOf("=")), value(pair.slice(pair.indexOf("=") + 1))]))
  const result = await mcp("tools/call", { name: tool, arguments: args })
  for (const piece of result.content ?? []) if (piece.type === "text") console.log(piece.text)
  if (result.structuredContent) {
    const shown = JSON.stringify(result.structuredContent, null, 2)
    console.log(`\nvalues:\n${shown.slice(0, 6000)}${shown.length > 6000 ? "\n... cut after 6000 characters" : ""}`)
  }
  if (result.isError) process.exitCode = 1
}

const [mode, tool, ...pairs] = process.argv.slice(2)
if (mode === "call" && tool) {
  await call(tool, pairs).catch((error) => {
    console.error(`The call failed at ${at.genui}/mcp: ${error.cause?.code ?? error.message}`)
    process.exitCode = 1
  })
} else {
  await part("Pages of the example app", "apps/app/src/routes", pages)
  await part("Answers: the tools of the generative UI backend", at.genui, answers)
  await part("Stored values", at.timeseries, values)
  await part("Notifications", at.events, notifications)
  await part("Chat", at.app, chat)
}
