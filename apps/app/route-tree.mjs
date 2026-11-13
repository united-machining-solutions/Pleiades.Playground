// Writes src/routeTree.gen.ts from the files under src/routes/.
//
//   node route-tree.mjs      (`pnpm install` and `pnpm typecheck` run it; it works from any folder)
//
// The route tree is not in the repository: it is written from the route files, so two branches
// that add a page each have nothing to merge in it. The development server and the build write it
// too. This script is for what comes before them: an editor after an install, and the typecheck.
// Why, and the way back: docs/adr/0008-route-tree-is-written-not-committed.md.
//
// It writes the file the way they do. The plugin of TanStack Start generates the tree while Vite
// reads its configuration, so reading the configuration is all it takes: nothing is built. That
// the plugin does so then is how it works today, not a promise. So the script looks whether the
// file is there afterwards, and says so if it is not. A file that is up to date is left as it is.

import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { resolveConfig } from "vite"

// The app is the folder of this script, wherever the script is started from.
const app = new URL(".", import.meta.url)

function fail(why, error) {
  console.error(`The route tree could not be written (src/routeTree.gen.ts): ${why}`)
  if (error) console.error(error)
  process.exit(1)
}

await resolveConfig({ root: fileURLToPath(app) }, "build").catch((error) =>
  fail("Vite could not read vite.config.ts.", error),
)

if (!existsSync(new URL("src/routeTree.gen.ts", app))) {
  fail(
    "Vite read its configuration, but the router plugin wrote no file. If an error about a route file is " +
      "printed above, fix that file first: the plugin writes no tree while a route does not parse. " +
      "Otherwise the plugin may generate the tree at another moment now, and " +
      "`pnpm --filter @pleiades/app build` writes it.",
  )
}
