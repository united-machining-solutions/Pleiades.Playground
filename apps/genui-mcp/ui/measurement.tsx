import { applyHostFonts, useApp } from "@modelcontextprotocol/ext-apps/react"
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps/react"
import { measurementList } from "@pleiades/cards/measurement/contract.ts"
import type { MeasurementList } from "@pleiades/cards/measurement/contract.ts"
import { MeasurementCards } from "@pleiades/cards/measurement/measurement-card.tsx"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"

import "./styles.css"

// The measurement card as an MCP App: the file a host loads from ui://genui/measurement and shows
// with a result of genui_measurement_list. The host sends that result. This file checks it against
// the contract of the card and draws the cards, the same component the example application draws.

type Shown = { values: MeasurementList } | { note: string }

/** What to draw for a result: the cards, or a sentence if the result holds none. */
function shownFor(result: { isError?: boolean; content?: ReadonlyArray<unknown>; structuredContent?: unknown }): Shown {
  const values = measurementList.safeParse(result.structuredContent)
  if (values.success) return { values: values.data }
  // A tool that failed says why in its first block of text.
  const [first] = result.content ?? []
  const said = typeof first === "object" && first !== null && "text" in first ? first.text : undefined
  return { note: result.isError && typeof said === "string" ? said : "This result is not a measurement card." }
}

/** The font of the host, so the card reads like the conversation around it. The colours stay the card's own. */
function takeFont(context: McpUiHostContext | undefined) {
  const fonts = context?.styles?.css?.fonts
  if (fonts) applyHostFonts(fonts)
  const sans = context?.styles?.variables?.["--font-sans"]
  if (sans) document.documentElement.style.setProperty("--font-sans", sans)
}

function Measurements() {
  const [shown, setShown] = useState<Shown>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-measurement-card", version: "0.1.0" },
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

  if (error) return <Note>No host answered: {error.message}</Note>
  // Nothing to show until the host sends the result.
  if (!shown) return null
  return "values" in shown ? <MeasurementCards {...shown.values} /> : <Note>{shown.note}</Note>
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

createRoot(document.getElementById("root")!).render(
  // The cards fill the width the host gives them. Their ring lies outside their box: the padding
  // keeps the host from cutting it off.
  <div className="p-1">
    <Measurements />
  </div>,
)
