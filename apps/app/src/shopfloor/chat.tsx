import { ShopfloorCard } from "@pleiades/cards/shopfloor/shopfloor-card.tsx"

import type { ChatTool } from "@/chat/tool-results.ts"

import { shopfloorShowOf } from "./results.ts"

// The shop floor card in the chat: what a call of its tool is called, and what the chat draws for a
// result. chat/cards.tsx lists this module.

export const shopfloorTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_shopfloor_show",
    label: {
      running: "Looking at the shop floor",
      done: "Looked at the shop floor",
      failed: "Failed to look at the shop floor",
    },
    draw(content) {
      const values = shopfloorShowOf(content)
      return values && <ShopfloorCard {...values} />
    },
  },
]
