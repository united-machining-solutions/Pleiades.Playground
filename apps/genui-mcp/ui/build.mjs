// Builds the card files: every page of this folder (`<name>.html`) becomes dist/ui/<name>.html.
//
//   node ui/build.mjs      (from apps/genui-mcp; `pnpm build` runs it)
//
// A card adds its page here and is named nowhere: the pages are read from the folder. Each page
// gets a build of its own, because a card file is one HTML file that carries everything it needs,
// and one build for several pages would share code between them in a file of its own.

import { readdirSync } from "node:fs"
import { resolve } from "node:path"

import { build } from "vite"

const here = import.meta.dirname
const pages = readdirSync(here)
  .filter((file) => file.endsWith(".html"))
  .sort()

for (const [index, page] of pages.entries()) {
  await build({
    root: here,
    // The folder of the card files is emptied once, before the first page.
    build: { emptyOutDir: index === 0, rolldownOptions: { input: resolve(here, page) } },
  })
}
