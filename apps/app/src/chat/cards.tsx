import { documentationTools } from "@/documentation/chat.tsx"
import { energyTools } from "@/cards/energy/chat.tsx"
import { machineTools } from "@/cards/machine/chat.tsx"
import { measurementTools } from "@/cards/measurement/chat.tsx"
import { notificationTools } from "@/cards/notification/chat.tsx"
import { opcuaTools } from "@/cards/opcua/chat.tsx"
import { siteTools } from "@/cards/site/chat.tsx"
import { timeseriesTools } from "@/cards/timeseries/chat.tsx"

import { backendTools } from "./tool-results.ts"
import type { ChatTool } from "./tool-results.ts"

/**
 * The tools the chat knows: those of the backend itself, then those of each card, one line for a
 * card, in the order of the alphabet. This list is the one place in the app a new card adds itself
 * to. The chat takes from it what a call is called and what it draws for a result, and its server
 * which tools a language model does not get.
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
]
