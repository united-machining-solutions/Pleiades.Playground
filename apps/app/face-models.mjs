// Copies the models of the face recognition from the package @vladmandic/human into public/models/faces/,
// where the app serves them: the browser loads them from the app, never from a CDN.
//
//   node face-models.mjs      (`pnpm dev` and `pnpm build` run it; it works from any folder)
//
// The models are the ones of the package, MIT like it, about 10 MB; they are not committed
// (.gitignore). They describe faces in general and hold no face of anyone here: the faces that are
// enrolled stay in the browser that enrolled them.

import { copyFile, mkdir, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// The detector, the mesh that straightens a face, and the descriptor. src/titan/faces/detector.ts
// names the same three.
const MODELS = ["blazeface", "facemesh", "faceres"]

const app = dirname(fileURLToPath(import.meta.url))
// pnpm links the package into the node_modules of the app; its exports do not name the models.
const from = join(app, "node_modules", "@vladmandic", "human", "models")
const to = join(app, "public", "models", "faces")

await mkdir(to, { recursive: true })
for (const model of MODELS) {
  for (const file of [`${model}.json`, `${model}.bin`]) {
    const source = join(from, file)
    const target = join(to, file)
    // A file that is there in the same size is left as it is.
    const [a, b] = await Promise.all([stat(source), stat(target).catch(() => undefined)])
    if (b?.size !== a.size) await copyFile(source, target)
  }
}
console.log(`face models: ${MODELS.join(", ")} in public/models/faces/`)
