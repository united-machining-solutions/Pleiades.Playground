import { useApp } from "@modelcontextprotocol/ext-apps/react"
import { siteList } from "@pleiades/cards/site/contract.ts"
import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { SiteCards } from "@pleiades/cards/site/site-card.tsx"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import { Note, takeFont } from "./host.tsx"
import { shownFor } from "./shown.ts"
import type { Shown } from "./shown.ts"
import "./styles.css"

// The site card as an MCP App: the file a host loads from ui://genui/site and shows with a result
// of genui_site_list. The host sends that result. This file checks it against the contract of the
// card and draws the cards, the same component the example application draws. It asks the server
// for nothing more.

function Sites() {
  const [shown, setShown] = useState<Shown<SiteList>>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-site-card", version: "0.1.0" },
    capabilities: {},
    // Before the handshake, so that no result is missed.
    onAppCreated(created) {
      created.addEventListener("toolresult", (result) => setShown(shownFor(result, siteList, "a site card")))
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
  return <SiteCards {...shown.values} />
}

createRoot(document.getElementById("root")!).render(
  // The cards fill the width the host gives them. Their ring lies outside their box: the padding
  // keeps the host from cutting it off.
  <div className="p-1">
    <Sites />
  </div>,
)
