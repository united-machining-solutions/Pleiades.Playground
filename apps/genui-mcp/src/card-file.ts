import { readFile } from "node:fs/promises"

// The cards as files a host can show (MCP Apps). A card file is one HTML page with its script and
// its styles inside. "pnpm build" writes it from ui/ to dist/ui, and the server reads it there
// each time a host asks for it.

/** The media type that tells a host that a resource is an MCP App. */
export const CARD_MIME_TYPE = "text/html;profile=mcp-app"

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
