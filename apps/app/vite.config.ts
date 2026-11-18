import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The React plugin must come after the Start plugin. Nitro builds the Node.js server in .output/,
  // and runs its plugin when the server starts: the registration at the Pleiades Hub.
  plugins: [tailwindcss(), tanstackStart(), nitro({ plugins: ["./src/hub/plugin.ts"] }), viteReact()],
})
