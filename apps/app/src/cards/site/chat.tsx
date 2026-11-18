import { SiteCards } from "@pleiades/cards/site/site-card.tsx"

import type { ChatTool } from "@/chat/tool-results.ts"

import { siteListOf } from "./results.ts"

// The site card in the chat: what a call of its tool is called, and what the chat draws for a
// result. chat/cards.tsx lists this module.

export const siteTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_site_list",
    label: {
      running: "Reading the sites",
      done: "Read the sites",
      failed: "Failed to read the sites",
    },
    draw(content) {
      const values = siteListOf(content)
      return values && <SiteCards {...values} />
    },
  },
]
