import { addPersona } from "../../chat/personas.server.ts"

import { TITAN_PERSONA, titanInstructions } from "./persona.ts"

// Titan's instructions, added to the chat for the questions asked on Titan's screen. The server routes
// of Titan import this module, so a build with the showcases has Titan's persona and one without has
// nothing of it.

addPersona(TITAN_PERSONA, titanInstructions)
