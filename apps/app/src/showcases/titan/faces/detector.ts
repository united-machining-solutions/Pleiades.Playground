// Finds a face in a picture and describes it, in the browser, with Human (@vladmandic/human, MIT).
//
// The models come from the app itself, /models/faces/ (face-models.mjs copies them there from the
// package), so nothing is downloaded from elsewhere at run time. The computing runs on the graphics
// card of this computer (WebGL). No picture and no descriptor leaves the browser.

import type { Config, FaceResult, Human } from "@vladmandic/human"

import type { CameraFrame, CameraSource } from "./camera.ts"
import type { Descriptor } from "./match.ts"

/** Where the app serves the models; face-models.mjs writes them there. */
export const MODEL_BASE = `${import.meta.env.BASE_URL}models/faces/`

/** A face in a picture: where it is, as shares of the picture, and its descriptor if it was described. */
export type Face = {
  box: { x: number; y: number; width: number; height: number }
  score: number
  descriptor?: Descriptor
}

// Only what is needed: the detector (blazeface), the mesh that straightens the face (facemesh) and the
// descriptor (faceres). Each run looks anew: a cached result would give the same descriptor twice.
const config: Partial<Config> = {
  backend: "humangl",
  modelBasePath: MODEL_BASE,
  // Never a CDN: without WebGL, Human would fetch its WebAssembly from jsdelivr. Here it finds none and
  // the page says the models could not be loaded.
  wasmPath: MODEL_BASE,
  // The models are served by the app; the browser keeps them in its HTTP cache.
  cacheModels: false,
  cacheSensitivity: 0,
  debug: false,
  warmup: "none",
  filter: { enabled: true, equalization: false, flip: false },
  gesture: { enabled: false },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  segmentation: { enabled: false },
  face: {
    enabled: true,
    detector: { modelPath: "blazeface.json", rotation: true, maxDetected: 3, minConfidence: 0.5, skipFrames: 0, skipTime: 0 },
    mesh: { enabled: true, modelPath: "facemesh.json" },
    attention: { enabled: false },
    iris: { enabled: false },
    emotion: { enabled: false },
    description: { enabled: true, modelPath: "faceres.json", skipFrames: 0, skipTime: 0, minConfidence: 0.1 },
    antispoof: { enabled: false },
    liveness: { enabled: false },
    gear: { enabled: false },
  },
}

/** Looking only for whether a face is there: the detector alone, a fraction of the work. */
const glance: Partial<Config> = {
  face: { ...config.face, mesh: { enabled: false }, description: { enabled: false } },
}

/** Looking at who it is: mesh and descriptor as well. */
const look: Partial<Config> = { face: config.face }

let human: Promise<Human> | undefined

/** Loads Human and its models once; every caller after the first gets the same instance. */
export function loadDetector(): Promise<Human> {
  human ??= (async () => {
    // Only in the browser. The server build leaves the library out: its build for Node.js wants
    // @tensorflow/tfjs-node, which is not installed and not needed.
    if (import.meta.env.SSR) throw new Error("Face recognition runs in the browser only")
    // Loaded on demand: the library with TensorFlow.js is large, and only these pages need it.
    const { Human } = await import("@vladmandic/human")
    const instance = new Human(config)
    await instance.load()
    return instance
  })().catch((error: unknown) => {
    human = undefined
    throw error
  })
  return human
}

let prepared: Promise<void> | undefined

/**
 * Loads the models and runs them once on an empty picture, so that the first real look is fast: the
 * first run of a model compiles it for the graphics card and takes seconds. Titan calls it as its page
 * opens, before anyone starts it. A failure is left to the first real look to report.
 */
export function prepareDetector(): Promise<void> {
  prepared ??= (async () => {
    const instance = await loadDetector()
    const canvas = document.createElement("canvas")
    canvas.width = 128
    canvas.height = 128
    await instance.detect(canvas, look)
  })().catch(() => {
    prepared = undefined
  })
  return prepared
}

function sizeOf(frame: CameraFrame): { width: number; height: number } {
  if (frame instanceof HTMLVideoElement) return { width: frame.videoWidth, height: frame.videoHeight }
  return { width: frame.width, height: frame.height }
}

function toFace(face: FaceResult, size: { width: number; height: number }): Face {
  const [x, y, width, height] = face.box
  return {
    box: { x: x / size.width, y: y / size.height, width: width / size.width, height: height / size.height },
    score: face.score,
    descriptor: face.embedding && face.embedding.length > 0 ? face.embedding : undefined,
  }
}

/**
 * The faces in a picture, the largest first. With `describe`, each also gets its descriptor; without,
 * only the detector runs, which is what watching for someone costs.
 */
export async function findFaces(frame: CameraFrame, { describe = true } = {}): Promise<Array<Face>> {
  const detector = await loadDetector()
  const result = await detector.detect(frame, describe ? look : glance)
  if (result.error) throw new Error(String(result.error))
  const size = sizeOf(frame)
  return result.face
    .map((face) => toFace(face, size))
    .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)
}

/** Takes a frame from `camera`, looks at it and lets go of it. Undefined while the camera has none. */
export async function lookAt(camera: CameraSource, options?: { describe?: boolean }): Promise<Array<Face> | undefined> {
  const frame = await camera.frame()
  if (!frame) return undefined
  try {
    return await findFaces(frame, options)
  } finally {
    if (typeof ImageBitmap !== "undefined" && frame instanceof ImageBitmap) frame.close()
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The descriptors of one face for enrolment: `count` pictures, `intervalMs` apart, each with exactly one
 * face. A picture with no face or with several is skipped; after `timeoutMs` it gives up.
 */
export async function captureDescriptors(
  camera: CameraSource,
  {
    count = 10,
    intervalMs = 350,
    timeoutMs = 20_000,
    onProgress,
    signal,
  }: { count?: number; intervalMs?: number; timeoutMs?: number; onProgress?: (taken: number) => void; signal?: AbortSignal } = {},
): Promise<Array<Descriptor>> {
  const descriptors: Array<Descriptor> = []
  const until = Date.now() + timeoutMs
  while (descriptors.length < count) {
    if (signal?.aborted) throw new Error("Enrolment was cancelled")
    if (Date.now() > until) throw new Error(`Only ${descriptors.length} of ${count} pictures showed exactly one face`)
    const faces = await lookAt(camera, { describe: true })
    const descriptor = faces?.length === 1 ? faces[0]?.descriptor : undefined
    if (descriptor) {
      descriptors.push(descriptor)
      onProgress?.(descriptors.length)
    }
    await pause(intervalMs)
  }
  return descriptors
}
