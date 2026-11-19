import { NotificationCard } from "@pleiades/cards/notification/notification-card.tsx"

import type { ChatTool } from "@/chat/tool-results.ts"

import { notificationListOf } from "./results.ts"

// The notification card in the chat: what a call of its tool is called, and what the chat draws
// for a result. chat/cards.tsx lists this module.

export const notificationTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_notification_list",
    part: "The warnings and errors of one machine",
    label: {
      running: "Reading the notifications",
      done: "Read the notifications",
      failed: "Failed to read the notifications",
    },
    draw(content) {
      const values = notificationListOf(content)
      return values && <NotificationCard {...values} />
    },
  },
]
