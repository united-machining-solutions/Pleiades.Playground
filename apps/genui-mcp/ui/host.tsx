import { applyHostFonts } from "@modelcontextprotocol/ext-apps/react"
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps/react"
import type { ReactNode } from "react"

// What every card file shares with its host: the font, and the sentence it shows instead of a card.

/** The font of the host, so the card reads like the conversation around it. The colours stay the card's own. */
export function takeFont(context: McpUiHostContext | undefined) {
  const fonts = context?.styles?.css?.fonts
  if (fonts) applyHostFonts(fonts)
  const sans = context?.styles?.variables?.["--font-sans"]
  if (sans) document.documentElement.style.setProperty("--font-sans", sans)
}

/** A sentence in place of a card: why there is none. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
