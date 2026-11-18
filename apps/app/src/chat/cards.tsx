import { documentationTools } from "@/documentation/chat.tsx"
import { energyTools } from "@/cards/energy/chat.tsx"
import { machineTools } from "@/cards/machine/chat.tsx"
import { measurementTools } from "@/cards/measurement/chat.tsx"
import { notificationTools } from "@/cards/notification/chat.tsx"
import { opcuaTools } from "@/cards/opcua/chat.tsx"
import { siteTools } from "@/cards/site/chat.tsx"
import { timeseriesTools } from "@/cards/timeseries/chat.tsx"

import { proposalTool } from "./proposed-page.tsx"
import { backendTools } from "./tool-results.ts"
import type { ChatTool } from "./tool-results.ts"

/**
 * The tools the chat knows: those of the backend itself, then those of each card, one line for a
 * card, in the order of the alphabet, and last the one of the app itself that proposes a page. This
 * list is the one place in the app a new card adds itself to. The chat takes from it what a call is
 * called and what it draws for a result, its server which tools a language model does not get, and
 * the proposal of a page which tools a page can call.
 */
export const chatTools: ReadonlyArray<ChatTool> = [
  ...backendTools,
  ...documentationTools,
  ...energyTools,
  ...machineTools,
  ...measurementTools,
  ...notificationTools,
  ...opcuaTools,
  ...siteTools,
  ...timeseriesTools,
  // It reads this list when it draws a proposal, to name the parts of the page.
  proposalTool(() => chatTools),
]
