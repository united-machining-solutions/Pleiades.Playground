// Where the pictures of the face recognition come from. Every source gives frames on demand, so the
// rest of the module does not care whether a camera is plugged into this computer or stands at the hub.

/** One picture to look at. An `ImageBitmap` belongs to whoever asked for it and is closed by them. */
export type CameraFrame = ImageBitmap | HTMLVideoElement | HTMLCanvasElement

export type CameraSource = {
  /** The current picture, or undefined while there is none (the camera is starting or away). */
  frame(): Promise<CameraFrame | undefined>
  /** Lets go of the camera. A source that is stopped gives no more frames. */
  stop(): void
}

/** The camera of this computer, with its stream, so that a page can show it as well. */
export type BrowserCamera = CameraSource & { stream: MediaStream }

/**
 * Which camera the face recognition uses. The one setting to change once the camera at the hub is
 * there: `{ kind: "snapshot", url: "<its address>" }`. Its address is not known yet.
 */
export type CameraSetting = { kind: "browser" } | { kind: "snapshot"; url: string }

export const CAMERA: CameraSetting = { kind: "browser" }

/** Opens the camera that `setting` names. */
export function openCamera(setting: CameraSetting = CAMERA): Promise<CameraSource> {
  return setting.kind === "snapshot" ? Promise.resolve(snapshotCamera(setting.url)) : browserCamera()
}

/**
 * The camera of this computer, through getUserMedia. The browser asks the person once. The video
 * element stays out of the document: the detector reads its current picture.
 */
export async function browserCamera(constraints: MediaTrackConstraints = {}): Promise<BrowserCamera> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    // A small picture is enough to find a face across a desk and costs less to look at.
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user", ...constraints },
  })
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  await video.play().catch(() => undefined)
  let stopped = false

  return {
    stream,
    frame() {
      // HAVE_CURRENT_DATA: a picture is there to read.
      const ready = !stopped && video.readyState >= 2 && video.videoWidth > 0
      return Promise.resolve(ready ? video : undefined)
    },
    stop() {
      stopped = true
      for (const track of stream.getTracks()) track.stop()
      video.srcObject = null
    },
  }
}

/**
 * NOT TESTED: a camera that serves a JPEG on every request, such as one at the hub. Its address is not
 * known yet; it comes in through `CAMERA`. The camera must allow this page to read it (CORS). A picture
 * is only fetched from the camera: nothing is sent to it.
 */
export function snapshotCamera(url: string): CameraSource {
  let stopped = false
  return {
    async frame() {
      if (stopped) return undefined
      try {
        const response = await fetch(url, { cache: "no-store" })
        if (!response.ok) return undefined
        return await createImageBitmap(await response.blob())
      } catch {
        return undefined
      }
    },
    stop() {
      stopped = true
    },
  }
}
