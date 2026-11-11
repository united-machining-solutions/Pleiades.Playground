import { resolve } from "node:path"

import tailwindcss from "@tailwindcss/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// Builds the card files ("vite build ui"). A host loads a card as one resource, so a card is a
// single HTML file with its script and its styles inside. The server reads it from dist/ui.
export default defineConfig({
  plugins: [tailwindcss(), viteReact(), viteSingleFile()],
  build: {
    outDir: "../dist/ui",
    // The folder lies outside this one, so Vite asks to be told.
    emptyOutDir: true,
    rolldownOptions: { input: resolve(import.meta.dirname, "machine.html") },
  },
})
