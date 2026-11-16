import { fetchServerSentEvents, useAudioRecorder, useTranscription } from "@tanstack/ai-react"
import { MicIcon, SquareIcon } from "lucide-react"
import { useEffect, useEffectEvent } from "react"

import { InputGroupButton } from "@pleiades/ui/components/input-group"
import { Spinner } from "@pleiades/ui/components/spinner"
import { toast } from "@pleiades/ui/components/toast"

function fail(problem: unknown) {
  toast.add({
    type: "error",
    title: "Dictation did not work",
    description: problem instanceof Error ? problem.message : String(problem),
  })
}

/** Two minutes: enough for a question, and a few megabytes, far below what the route reads. */
const MAX_SECONDS = 120

/**
 * Dictation in the chat field. Press it, speak, press it again: what was said goes into the field,
 * to read, change and send like a typed question. Nothing is sent by itself. After two minutes the
 * recording stops by itself.
 *
 * shadcn has no component for it and names the parts: a Button, and a Spinner while the words are
 * written down. The browser records (TanStack AI's recorder); the model of the settings writes
 * down what was said, on the server (routes/api/transcribe.ts). It hears the language itself.
 */
export function DictateButton({ className, onText }: { className?: string; onText: (text: string) => void }) {
  const recorder = useAudioRecorder()
  const transcription = useTranscription({
    connection: fetchServerSentEvents("/api/transcribe"),
    // One slot for every dictation; nothing of it is kept.
    threadId: "dictation",
    onResult: (result) => {
      const text = result.text.trim()
      if (text === "") toast.add({ title: "Nothing was heard", description: "Speak after you press the microphone." })
      else onText(text)
    },
    onError: fail,
  })

  const toggle = async () => {
    try {
      if (!recorder.isSupported) {
        // The browser lets a page use the microphone only over https, or on this computer.
        throw new Error("This browser lets the app use the microphone only over https or on localhost.")
      }
      if (!recorder.isRecording) {
        await recorder.start()
        return
      }
      const recording = await recorder.stop()
      // The type without its codecs, so that the model gets the format the browser recorded in.
      const type = recording.mimeType.split(";")[0]
      await transcription.generate({ audio: `data:${type};base64,${recording.base64}` })
    } catch (problem) {
      fail(problem)
    }
  }

  // After two minutes the recording stops by itself and is written down, as if the button was pressed.
  const stopAtLimit = useEffectEvent(() => {
    toast.add({ title: "Dictation stopped after two minutes", description: "Press the microphone again to go on." })
    void toggle()
  })
  useEffect(() => {
    if (!recorder.isRecording) return
    const timer = setTimeout(() => stopAtLimit(), MAX_SECONDS * 1000)
    return () => clearTimeout(timer)
  }, [recorder.isRecording])

  // One button with one name; aria-pressed says whether it records. While the model writes, the button
  // is disabled but keeps the focus (Base UI's focusableWhenDisabled), also when the request fails.
  const writing = transcription.isLoading
  return (
    <InputGroupButton
      variant={recorder.isRecording ? "secondary" : "ghost"}
      size="icon-sm"
      className={className}
      aria-label="Dictate"
      aria-pressed={recorder.isRecording}
      disabled={writing}
      focusableWhenDisabled
      onClick={() => void toggle()}
    >
      {writing ? <Spinner /> : recorder.isRecording ? <SquareIcon /> : <MicIcon />}
    </InputGroupButton>
  )
}
