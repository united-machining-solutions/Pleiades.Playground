import assert from "node:assert/strict"
import { join } from "node:path"
import { after, before, test } from "node:test"

import react from "@vitejs/plugin-react"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createServer } from "vite"
import type { ViteDevServer } from "vite"

// The page of a machine while it is read shows no word of its own: no title, no label, no head of a
// table, no button. A reader of the screen is told that it is being read, and the headings come with the
// data. The placeholders are drawn through Vite, as the app draws them, so they are the ones the page shows.

const here = import.meta.dirname
const cards = join(here, "../../../../packages/cards/src")
const loading = join(here, "loading.tsx")

let server: ViteDevServer
before(async () => {
  server = await createServer({
    configFile: false,
    root: join(here, "../.."),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: { tsconfigPaths: true },
    plugins: [react()],
  })
})
after(async () => {
  await server.close()
})

/** A placeholder, drawn as the page draws it. */
async function drawn(file: string, name: string, props: Record<string, unknown> = {}): Promise<string> {
  const module = await server.ssrLoadModule(file)
  return renderToStaticMarkup(createElement(module[name] as never, props))
}

const STATUS = /<p role="status" class="sr-only">([\s\S]*?)<\/p>/g

/** What a reader of the screen is told, and what a sighted one reads, apart. */
function wordsOf(html: string) {
  const told = [...html.matchAll(STATUS)].map((match) => match[1]?.replace(/<!-- -->/g, "").trim())
  const seen = html.replace(STATUS, "").replace(/<[^>]*>/g, "").trim()
  return { told, seen }
}

const PLACEHOLDERS: Array<[what: string, file: string, name: string, props?: Record<string, unknown>]> = [
  ["the page", loading, "MachinePageSkeleton"],
  ["the alarms", loading, "AlarmsPending"],
  ["power and energy", loading, "PowerAndEnergyPending"],
  ["the tiles of what the machine measures", loading, "TilesPending"],
  ["the table of the notifications", join(cards, "notification/notification-table.tsx"), "NotificationTableSkeleton", { rows: 3 }],
  ["the machine card", join(cards, "machine/machine-card.tsx"), "MachineCardSkeleton"],
  ["the tiles of the card package", join(cards, "measurement/measurement-tiles.tsx"), "MeasurementTilesSkeleton"],
]

for (const [what, file, name, props] of PLACEHOLDERS) {
  test(`${what} shows no text, no heading and no button while it is read`, async () => {
    const html = await drawn(file, name, props)
    assert.equal(wordsOf(html).seen, "")
    assert.doesNotMatch(html, /<h[1-6][\s>]/)
    assert.doesNotMatch(html, /<button[\s>]/)
  })
}

test("the page tells a reader of the screen once that it is being read", async () => {
  const html = await drawn(loading, "MachinePageSkeleton")
  assert.deepEqual(wordsOf(html).told, ["Loading machine"])
  assert.match(html, /aria-busy="true"/)
})

test("a section that is read later says what it waits for", async () => {
  assert.deepEqual(wordsOf(await drawn(loading, "AlarmsPending")).told, ["Loading alarms and warnings"])
  assert.deepEqual(wordsOf(await drawn(loading, "PowerAndEnergyPending")).told, ["Loading power and energy"])
  assert.deepEqual(wordsOf(await drawn(loading, "TilesPending")).told, ["Loading current values"])
})
