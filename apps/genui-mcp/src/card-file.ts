import { readFile } from "node:fs/promises"

// The cards as files a host can show (MCP Apps). A card file is one HTML page with its script and
// its styles inside. "pnpm build" writes it from ui/ to dist/ui, and the server reads it there
// each time a host asks for it.

/** The media type that tells a host that a resource is an MCP App. */
export const CARD_MIME_TYPE = "text/html;profile=mcp-app"

/**
 * What a card tells a host about itself.
 *
 * - A card draws its own frame and its own ground, so it asks the host for none. The standard
 *   recommends to say so, because the hosts' defaults differ.
 * - A card loads nothing of its own. It takes the font of its host, and a host that serves its
 *   font from an origin of its own has to see that origin here, or its sandbox blocks the font.
 *   So this lists the font origins of the hosts the card was looked at in.
 */
export const CARD_META = {
  ui: {
    prefersBorder: false,
    csp: { resourceDomains: ["https://assets.claude.ai"] },
  },
}

const built = new URL("../dist/ui/", import.meta.url)

/** The card file of that name, from the folder the build writes to. */
export async function readCardFile(name: string, folder: URL = built): Promise<string> {
  try {
    return await readFile(new URL(`${name}.html`, folder), "utf8")
  } catch (cause) {
    throw new Error(`The card file ${name}.html is not built. Run "pnpm --filter @pleiades/genui-mcp build".`, {
      cause,
    })
  }
}
