import { applyHostFonts, useApp } from "@modelcontextprotocol/ext-apps/react"
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps/react"
import { energySeries, energyShow } from "@pleiades/cards/energy/contract.ts"
import type { EnergySeries, EnergyShow } from "@pleiades/cards/energy/contract.ts"
import { EnergyCard } from "@pleiades/cards/energy/energy-card.tsx"
import type { Lines } from "@pleiades/cards/energy/energy-card.tsx"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"

import { ENERGY_SERIES_TOOL } from "../src/cards/energy.names.ts"
import { lastAsked } from "./latest.ts"
import "./styles.css"

// The energy card as an MCP App: the file a host loads from ui://genui/energy and shows with a
// result of genui_energy_show. The host sends that result. This file checks it against the
// contract of the card and draws the card, the same component the example application draws, with
// the graph of the power, which it asks the server for.

type Shown = { values: EnergyShow } | { note: string }

/** What to draw for a result: the card, or a sentence if the result holds none. */
function shownFor(result: { isError?: boolean; content?: ReadonlyArray<unknown>; structuredContent?: unknown }): Shown {
  const values = energyShow.safeParse(result.structuredContent)
  if (values.success) return { values: values.data }
  // A tool that failed says why in its first block of text.
  const [first] = result.content ?? []
  const said = typeof first === "object" && first !== null && "text" in first ? first.text : undefined
  return { note: result.isError && typeof said === "string" ? said : "This result is not an energy card." }
}

/**
 * The lines of the graph. They are not part of the result, because a language model reads that:
 * the card asks the server for them, through the host, for the hours and machines of the result.
 * Null if they are not to be had, for example where a host lets no card call a tool. The card then
 * stands without its graph.
 */
async function seriesOf(app: App, values: EnergyShow): Promise<EnergySeries | null> {
  if (values.machines.length === 0) return null
  try {
    const result = await app.callServerTool({
      name: ENERGY_SERIES_TOOL,
      arguments: { from: values.from, to: values.to, machines: values.machines.map((one) => one.machine) },
    })
    const series = energySeries.safeParse(result.structuredContent)
    return series.success ? series.data : null
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

/** The lines of the newest result only: a host may send a second result before the first is answered. */
const askLines = lastAsked()

function Energy() {
  const [shown, setShown] = useState<Shown>()
  const [series, setSeries] = useState<Lines>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-energy-card", version: "0.1.0" },
    capabilities: {},
    // Before the handshake, so that no result is missed.
    onAppCreated(created) {
      created.addEventListener("toolresult", (result) => {
        const next = shownFor(result)
        setShown(next)
        setSeries(undefined)
        if ("values" in next) askLines(seriesOf(created, next.values), setSeries)
      })
      created.addEventListener("hostcontextchanged", takeFont)
    },
  })
  useEffect(() => {
    if (app && isConnected) takeFont(app.getHostContext())
  }, [app, isConnected])

  if (error) return <Note>No host answered: {error.message}</Note>
  // Nothing to show until the host sends the result.
  if (!shown) return null
  if (!("values" in shown)) return <Note>{shown.note}</Note>
  return <EnergyCard {...shown.values} series={series} />
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

createRoot(document.getElementById("root")!).render(
  // The card fills the width the host gives it. Its ring lies outside its box: the padding keeps
  // the host from cutting it off.
  <div className="p-1">
    <Energy />
  </div>,
)
