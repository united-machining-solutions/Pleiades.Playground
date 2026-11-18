import type { ChatExtension } from "@/chat/extensions.ts"

import { TITAN_PERSONA } from "./persona.ts"
import { sharingCards } from "./voice/shown.ts"
import { speakingAnswers } from "./voice/voice.ts"

// How Titan's page takes part in the open chat (chat/extensions.ts): every question names Titan's
// persona, so the server adds Titan's instructions (persona.server.ts); the answers are read aloud as
// they arrive, a question asked by voice goes on in that chat, and the cards and the briefing of the
// newest answer go to the screen.

export const TITAN_CHAT: ChatExtension = {
  forwardedProps: { persona: TITAN_PERSONA },
  attach(chat) {
    const taps = [speakingAnswers(chat), sharingCards()]
    return {
      update: (messages, isLoading) => {
        for (const tap of taps) tap.update(messages, isLoading)
      },
      detach: () => {
        for (const tap of taps) tap.detach()
      },
    }
  },
}
