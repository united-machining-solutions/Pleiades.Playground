import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The React plugin must come after the Start plugin. Nitro builds the Node.js server in .output/.
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
})
