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
 *   Which origins those are depends on the hosts a server is used with, so they are a setting,
 *   and without it a card names none.
 */
export function cardMeta(resourceDomains: ReadonlyArray<string>) {
  return {
    ui: {
      prefersBorder: false,
      ...(resourceDomains.length > 0 && { csp: { resourceDomains: [...resourceDomains] } }),
    },
  }
}

/**
 * The origins a setting names, separated by commas. An origin is a scheme and a host, for example
 * https://fonts.example.com. Anything else is refused when the server starts, because a host
 * would drop it without a word.
 */
export function originsOf(setting: string | undefined): Array<string> {
  const named = (setting ?? "").split(",").flatMap((one) => one.trim() || [])
  for (const one of named) {
    if (!URL.canParse(one) || new URL(one).origin !== one) {
      throw new Error(
        `CARD_RESOURCE_DOMAINS names "${one}", which is not an origin: a scheme and a host, for example https://fonts.example.com.`,
      )
    }
  }
  return named
}

/** The one setting of the card files. It is read here, once, when the server starts. */
export const CARD_META = cardMeta(originsOf(process.env.CARD_RESOURCE_DOMAINS))

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
