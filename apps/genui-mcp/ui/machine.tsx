import { useApp } from "@modelcontextprotocol/ext-apps/react"
import type { App } from "@modelcontextprotocol/ext-apps/react"
import { machineShow, spanList } from "@pleiades/cards/machine/contract.ts"
import type { MachineShow } from "@pleiades/cards/machine/contract.ts"
import { MachineCard } from "@pleiades/cards/machine/machine-card.tsx"
import type { Spans } from "@pleiades/cards/machine/state-band.tsx"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import { SPAN_LIST_TOOL } from "../src/cards/machine.names.ts"
import { Note, takeFont } from "./host.tsx"
import { shownFor } from "./shown.ts"
import type { Shown } from "./shown.ts"
import "./styles.css"

// The machine card as an MCP App: the file a host loads from ui://genui/machine and shows with a
// result of genui_machine_show. The host sends that result. This file checks it against the
// contract of the card and draws the card, the same component the example application draws.

/**
 * The spans of the band. They are not part of the result, because a language model reads that:
 * the card asks the server for them, through the host, for the hours its values are about. Null
 * if they are not to be had, for example where a host lets no card call a tool. The card then
 * stands without its band.
 */
async function spansOf(app: App, { machine, history }: MachineShow): Promise<Spans> {
  try {
    const result = await app.callServerTool({
      name: SPAN_LIST_TOOL,
      arguments: { machine: machine.machine, from: history.from, to: history.to },
    })
    const list = spanList.safeParse(result.structuredContent)
    return list.success ? list.data.spans : null
  } catch {
    return null
  }
}

function Machine() {
  const [shown, setShown] = useState<Shown<MachineShow>>()
  const [spans, setSpans] = useState<Spans>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-machine-card", version: "0.1.0" },
    capabilities: {},
    // Before the handshake, so that no result is missed.
    onAppCreated(created) {
      created.addEventListener("toolresult", (result) => {
        const next = shownFor(result, machineShow, "a machine card")
        setShown(next)
        setSpans(undefined)
        if ("values" in next) void spansOf(created, next.values).then(setSpans)
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
  return "values" in shown ? <MachineCard {...shown.values} spans={spans} /> : <Note>{shown.note}</Note>
}

createRoot(document.getElementById("root")!).render(
  // The card fills the width the host gives it. Its ring lies outside its box: the padding keeps
  // the host from cutting it off.
  <div className="p-1">
    <Machine />
  </div>,
)
