import { useApp } from "@modelcontextprotocol/ext-apps/react"
import { notificationList } from "@pleiades/cards/notification/contract.ts"
import type { NotificationList } from "@pleiades/cards/notification/contract.ts"
import { NotificationCard } from "@pleiades/cards/notification/notification-card.tsx"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import { Note, takeFont } from "./host.tsx"
import { shownFor } from "./shown.ts"
import type { Shown } from "./shown.ts"
import "./styles.css"

// The notification card as an MCP App: the file a host loads from ui://genui/notification and shows
// with a result of genui_notification_list. The host sends that result. This file checks it
// against the contract of the card and draws the card, the same component the example application
// draws. It asks the server for nothing more.

function Notifications() {
  const [shown, setShown] = useState<Shown<NotificationList>>()
  const { app, isConnected, error } = useApp({
    appInfo: { name: "pleiades-notification-card", version: "0.1.0" },
    capabilities: {},
    // Before the handshake, so that no result is missed.
    onAppCreated(created) {
      created.addEventListener("toolresult", (result) => setShown(shownFor(result, notificationList, "a notification card")))
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
  return <NotificationCard {...shown.values} />
}

createRoot(document.getElementById("root")!).render(
  // The card fills the width the host gives it. Its ring lies outside its box: the padding keeps the
  // host from cutting it off.
  <div className="p-1">
    <Notifications />
  </div>,
)
