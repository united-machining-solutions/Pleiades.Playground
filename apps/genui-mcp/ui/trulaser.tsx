import { applyHostFonts, useApp } from "@modelcontextprotocol/ext-apps/react"
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps/react"
import { trulaserSeries, trulaserShow, trulaserTimeline } from "@pleiades/cards/trulaser/contract.ts"
import type { ConditionKey, TrulaserSeries, TrulaserShow } from "@pleiades/cards/trulaser/contract.ts"
import type { Timeline } from "@pleiades/cards/trulaser/timelines.tsx"
import { TrulaserCard } from "@pleiades/cards/trulaser/trulaser-card.tsx"
import { useCallback, useEffect, useState } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"

import { TRULASER_SERIES_TOOL, TRULASER_TIMELINE_TOOL } from "../src/cards/trulaser.names.ts"
import "./styles.css"

// The TruLaser card as an MCP App: the file a host loads from ui://genui/trulaser and shows with a
// result of genui_trulaser_show. The host sends that result. This file checks it against the
// contract of the card and draws the card, the same component the example application draws.

type Shown = { values: TrulaserShow } | { note: string }

/** What to draw for a result: the card, or a sentence if the result holds no card. */
function shownFor(result: { isError?: boolean; content?: ReadonlyArray<unknown>; structuredContent?: unknown }): Shown {
  const values = trulaserShow.safeParse(result.structuredContent)
  if (values.success) return { values: values.data }
  // A tool that failed says why in its first block of text.
  const [first] = result.content ?? []
  const said = typeof first === "object" && first !== null && "text" in first ? first.text : undefined
  return { note: result.isError && typeof said === "string" ? said : "This result is not a TruLaser card." }
}

/**
 * The timelines. They are not part of the result, because a language model reads that: the card
 * asks the server for them, through the host. Null if they are not to be had, for example where a
 * host lets no card call a tool. The card then stands without them.
 */
async function timelineOf(app: App, machine: string, hours: number): Promise<Timeline> {
  try {
    const result = await app.callServerTool({ name: TRULASER_TIMELINE_TOOL, arguments: { machine, hours } })
    const read = trulaserTimeline.safeParse(result.structuredContent)
    return read.success ? read.data : null
  } catch {
    return null
  }
}

/** The values of one tile over time, for its chart, through the host. */
async function seriesOf(app: App, machine: string, key: ConditionKey, hours: number): Promise<TrulaserSeries | null> {
  try {
    const result = await app.callServerTool({ name: TRULASER_SERIES_TOOL, arguments: { machine, key, hours } })
    const read = trulaserSeries.safeParse(result.structuredContent)
    return read.success ? read.data : null
  } catch {
    return null
  }
}

/** The font of the host, so the card reads like the conversation around it. The colours stay the card's own. */
function takeFont(context: McpUiHostContext | undefined) {
  const fonts = context?.styles?.css?.fonts
  if (fonts) applyHostFonts(fonts)
  const sans = context?.styles?.variables?.["--font-sans"]
  if (sans) document.documentElement.style.setProperty("--font-sans", sans)
}

function Trulaser() {
  const [shown, setShown] = useState<Shown>()
  const [hours, setHours] = useState(1)
  const [timeline, setTimeline] = useState<Timeline>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-trulaser-card", version: "0.1.0" },
    capabilities: {},
    // Before the handshake, so that no result is missed.
    onAppCreated(created) {
      created.addEventListener("toolresult", (result) => setShown(shownFor(result)))
      created.addEventListener("hostcontextchanged", takeFont)
    },
  })
  useEffect(() => {
    if (app && isConnected) takeFont(app.getHostContext())
  }, [app, isConnected])

  const machine = shown && "values" in shown ? shown.values.machine : null
  useEffect(() => {
    if (!app || machine === null) return
    let wanted = true
    setTimeline(undefined)
    void timelineOf(app, machine, hours).then((read) => wanted && setTimeline(read))
    return () => {
      wanted = false
    }
  }, [app, machine, hours])
  const readSeries = useCallback(
    (key: ConditionKey) => (app && machine !== null ? seriesOf(app, machine, key, hours) : Promise.resolve(null)),
    [app, machine, hours],
  )

  if (error) return <Note>No host answered: {error.message}</Note>
  // Nothing to show until the host sends the result.
  if (!shown) return null
  if (!("values" in shown)) return <Note>{shown.note}</Note>
  return <TrulaserCard values={shown.values} timeline={timeline} hours={hours} onHours={setHours} readSeries={readSeries} />
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

createRoot(document.getElementById("root")!).render(
  // The card fills the width the host gives it. Its ring lies outside its box: the padding keeps
  // the host from cutting it off.
  <div className="p-1">
    <Trulaser />
  </div>,
)
