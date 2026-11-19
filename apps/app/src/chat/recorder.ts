// The recording of dictation: the microphone, and what it heard as a file in the format the browser
// records in.
//
// It is our own and not the recorder of TanStack AI, because the line in the chat field shows the level of
// the microphone while it records, and reads it from the same stream. The recorder of TanStack AI keeps its
// stream to itself, and a second request for the microphone mutes the first one in Safari on iOS (WebKit
// bug 179363), on the tablet that dictation is held on.

/**
 * The format the recorder is asked for. Without it Firefox records Ogg but reports an empty type
 * once the recording has stopped; the file is then called WebM, and the model refuses a file whose
 * name and content disagree. Asked for WebM, Firefox keeps the type. A browser that cannot record
 * WebM records in its own format.
 */
const RECORDING_TYPE = "audio/webm;codecs=opus"

/** A browser that has stopped did not say so within this time: what came so far is the recording. */
const STOP_WAIT_MS = 10_000

/** What was recorded: base64 without the `data:` before it, empty when nothing came, and its format. */
export type Recording = { base64: string; mimeType: string }

/** A recording that runs. */
export type Recorder = {
  /** The stream of the microphone, to read its level from. */
  stream: MediaStream
  /** Ends the recording, lets go of the microphone and gives what was recorded. */
  stop: () => Promise<Recording>
  /** Ends the recording and lets go of the microphone; nothing is kept. */
  cancel: () => void
}

/** Whether the browser lets this page record: only over https, or on this computer. */
export function canRecord(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  )
}

/** Opens the microphone and starts to record. Rejects when the browser does not give the microphone. */
export async function record(): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const release = () => stream.getTracks().forEach((track) => track.stop())
  let recorder: MediaRecorder
  try {
    const asked = MediaRecorder.isTypeSupported(RECORDING_TYPE) ? RECORDING_TYPE : undefined
    recorder = new MediaRecorder(stream, asked ? { mimeType: asked } : undefined)
    recorder.start()
  } catch (problem) {
    release()
    throw problem
  }
  // The format is known once the recorder runs; Firefox may forget it when it stops.
  const mimeType = recorder.mimeType || "audio/webm"
  const chunks: Array<Blob> = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  return {
    stream,
    stop: () =>
      new Promise<Recording>((resolve, reject) => {
        const done = () => {
          clearTimeout(late)
          recorder.onstop = null
          release()
          const blob = new Blob(chunks, { type: mimeType })
          base64Of(blob).then((base64) => resolve({ base64, mimeType }), reject)
        }
        const late = setTimeout(done, STOP_WAIT_MS)
        recorder.onstop = done
        if (recorder.state === "inactive") done()
        else recorder.stop()
      }),
    cancel: () => {
      recorder.ondataavailable = null
      recorder.onstop = null
      if (recorder.state !== "inactive") recorder.stop()
      release()
    },
  }
}

async function base64Of(blob: Blob): Promise<string> {
  if (blob.size === 0) return ""
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("The recording could not be read"))
    reader.readAsDataURL(blob)
  })
  return url.slice(url.indexOf(",") + 1)
}
