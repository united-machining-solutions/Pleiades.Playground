// Writes src/routeTree.gen.ts from the files under src/routes/.
//
//   node route-tree.mjs      (from apps/app; `pnpm install` and `pnpm typecheck` run it)
//
// The route tree is not in the repository: it is written from the route files, so two branches
// that add a page each have nothing to merge in it. The development server and the build write it
// too. This script is for what comes before them: an editor after an install, and the typecheck.
//
// It writes the file the way they do. The plugin of TanStack Start generates the tree while Vite
// reads its configuration, so reading the configuration is all it takes: nothing is built. That
// the plugin does so then is how it works today, not a promise. So the script looks whether the
// file is there afterwards, and says so if it is not. A file that is up to date is left as it is.

import { existsSync } from "node:fs"

import { resolveConfig } from "vite"

function fail(why, error) {
  console.error(`The route tree could not be written (src/routeTree.gen.ts): ${why}`)
  if (error) console.error(error)
  process.exit(1)
}

await resolveConfig({}, "build").catch((error) => fail("Vite could not read vite.config.ts.", error))

if (!existsSync(new URL("src/routeTree.gen.ts", import.meta.url))) {
  fail(
    "Vite read its configuration, but the router plugin wrote no file. It may generate the tree at another " +
      "moment now: `pnpm --filter @pleiades/app build` writes it in any case.",
  )
}
