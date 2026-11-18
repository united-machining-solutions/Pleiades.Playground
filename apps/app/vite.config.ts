import { execFileSync } from "node:child_process"

import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

/** The commit of the checkout, for `vite dev`. The image build has no git and no .git, and gets none. */
function checkoutCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

// The showcases: pages made for one demo or one fair, under src/routes/(showcases)/, with what they need
// under src/showcases/. They are built in only where APP_SHOWCASES is set to anything; the image build sets
// it from its argument SHOWCASES. Without it the folder holds no routes: the router does not know the
// pages, nothing imports their code, and the build has none of it. Whoever takes the app as a base gets
// the app alone. See docs/adr/0018-a-showcase-is-built-in-on-request-and-only-adds.md.
const showcases = Boolean(process.env.APP_SHOWCASES)
/** The name of the folder of their routes, as the router reads the names of files and folders. */
const SHOWCASE_ROUTES = "^\\(showcases\\)$"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The build the sidebar names. The image build sets APP_VERSION, APP_REVISION and APP_SOURCE from its
  // arguments VERSION, REVISION and SOURCE (see the Dockerfile); without them the version is "dev", and the
  // commit is that of the checkout, if there is one. Names of their own, so that a VERSION set in a shell
  // for another tool does not become the badge.
  define: {
    "import.meta.env.APP_VERSION": JSON.stringify(process.env.APP_VERSION || "dev"),
    "import.meta.env.APP_REVISION": JSON.stringify(process.env.APP_REVISION || checkoutCommit()),
    "import.meta.env.APP_SOURCE": JSON.stringify(process.env.APP_SOURCE || ""),
  },
  // The React plugin must come after the Start plugin. Nitro builds the Node.js server in .output/,
  // and runs its plugin when the server starts: the registration at the Pleiades Hub.
  plugins: [tailwindcss(), tanstackStart({ router: { routeFileIgnorePattern: showcases ? undefined : SHOWCASE_ROUTES } }), nitro({ plugins: ["./src/hub/plugin.ts"] }), viteReact()],
})
