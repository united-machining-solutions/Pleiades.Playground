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
  // The React plugin must come after the Start plugin. Nitro builds the Node.js server in .output/.
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
})
