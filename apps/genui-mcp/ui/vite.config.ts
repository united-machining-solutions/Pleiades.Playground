import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import tailwindcss from "@tailwindcss/vite"
import viteReact from "@vitejs/plugin-react"
import license from "rollup-plugin-license"
import { defineConfig } from "vite"
import type { Plugin } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

const repository = resolve(import.meta.dirname, "../../..")

/**
 * A card file travels alone: a host reads it as one resource. So it carries the notices for
 * everything in it, as a comment at its end: the notice of this repository, and the licence of
 * every package the build put into the file.
 */
function notices(): Array<Plugin> {
  let packages = ""
  return [
    license({
      thirdParty: {
        output(dependencies) {
          packages = dependencies.map((dependency) => dependency.text()).join("\n\n---\n\n")
        },
      },
    }) as Plugin,
    {
      name: "pleiades:notices",
      // After the single-file plugin, which writes the page this one adds to.
      enforce: "post",
      generateBundle(_options, bundle) {
        const text = [
          "Notices for the software in this file",
          "",
          "This file is a card of Pleiades Playground. The notice of that repository comes first,",
          "then the licence of every package that the build put into this file.",
          "The Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0",
          "",
          "===",
          "",
          readFileSync(resolve(repository, "NOTICE"), "utf8").trim(),
          "",
          "===",
          "",
          packages,
        ].join("\n")
        for (const file of Object.values(bundle)) {
          if (file.type === "asset" && file.fileName.endsWith(".html")) {
            // Nothing in the text may end the comment early.
            file.source = `${String(file.source).trimEnd()}\n<!--\n${text.replaceAll("-->", "-- >")}\n-->\n`
          }
        }
      },
    },
  ]
}

// Builds the card files ("vite build ui"). A host loads a card as one resource, so a card is a
// single HTML file with its script and its styles inside. The server reads it from dist/ui.
export default defineConfig({
  plugins: [tailwindcss(), viteReact(), viteSingleFile(), notices()],
  build: {
    outDir: "../dist/ui",
    // The folder lies outside this one, so Vite asks to be told.
    emptyOutDir: true,
    rolldownOptions: { input: resolve(import.meta.dirname, "machine.html") },
  },
})
