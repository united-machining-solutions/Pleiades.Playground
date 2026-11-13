// Writes src/routeTree.gen.ts from the files under src/routes/.
//
//   node route-tree.mjs      (from apps/app; `pnpm install` and `pnpm typecheck` run it)
//
// The route tree is not in the repository: it is written from the route files, so two branches
// that add a page each have nothing to merge in it. The development server and the build write it
// too. This script is for what comes before them: an editor after an install, and the typecheck.
//
// It writes the file the way they do. The plugin of TanStack Start generates the tree while Vite
// reads its configuration, so reading the configuration is all it takes: nothing is built.

import { resolveConfig } from "vite"

try {
  await resolveConfig({}, "build")
} catch (error) {
  console.error("The route tree could not be written (src/routeTree.gen.ts). Vite could not read vite.config.ts:")
  console.error(error)
  process.exit(1)
}
