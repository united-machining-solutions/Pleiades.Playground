import { machineCard } from "./machine.ts"

/**
 * The cards of this server: one module each, and one line each here, in the order of the alphabet.
 * This list is the one place a new card adds itself to. The server takes its tools and its card
 * file from it, and the description and the guide take their text about the card.
 */
export const cards = [
  machineCard,
] as const
