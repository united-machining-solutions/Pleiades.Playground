import { ViewCard } from "@pleiades/cards/view/view-card.tsx"

import type { ChatTool } from "@/chat/tool-results.ts"

import { viewShowOf } from "./results.ts"

// The view card in the chat: a view the language model laid out. chat/cards.tsx lists this module.

export const viewTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_view_show",
    label: {
      running: "Laying out a view",
      done: "Laid out a view",
      failed: "Failed to lay out a view",
    },
    draw(content) {
      const values = viewShowOf(content)
      return values && <ViewCard {...values} />
    },
  },
]
