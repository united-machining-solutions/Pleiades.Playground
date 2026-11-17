// A human-sounding voice that runs in the browser, with no server: Piper through piper-tts-web.
//
// The first time, the browser downloads the voice from huggingface.co (about 60 MB) and keeps it in its
// own storage (the origin private file system). The small program that turns words into sounds comes
// from cdn.jsdelivr.net and stays in the cache of the browser. From then on it speaks without a network,
// in the WLAN of the hub too. Load it once while there is internet, like the speech recognition.

/** A German voice of Piper in medium quality: clear, and quick enough for a sentence at a time. */
export const PIPER_VOICE = "de_DE-thorsten-medium"

export type PiperSession = { predict: (text: string) => Promise<Blob> }

let loading: Promise<PiperSession> | undefined
let ready: PiperSession | undefined

/**
 * Loads the voice, from the storage of the browser if it is there. `onProgress` gets a share between 0
 * and 1 while the voice arrives. Called again, it returns the same promise.
 */
export function loadPiper(onProgress?: (share: number) => void): Promise<PiperSession> {
  loading ??= (async () => {
    const { TtsSession } = await import("@mintplex-labs/piper-tts-web")
    const session = await TtsSession.create({
      voiceId: PIPER_VOICE,
      progress: (progress) => {
        if (progress.total > 0) onProgress?.(progress.loaded / progress.total)
      },
    })
    // One short word fetches the program that turns words into sounds, while there is internet.
    await session.predict("Hallo.")
    ready = session
    return session as PiperSession
  })()
  // A failed load may be tried again, for example once the network is back.
  loading.catch(() => {
    loading = undefined
  })
  return loading
}

/** The voice, if it has loaded; nothing while it loads or after it failed. */
export function piperIfReady(): PiperSession | undefined {
  return ready
}

/** A text in sentences, so that the first one sounds while the next is made. */
export function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]*["“”«»)]*\s*/g) ?? [text]).map((one) => one.trim()).filter((one) => one !== "")
}
