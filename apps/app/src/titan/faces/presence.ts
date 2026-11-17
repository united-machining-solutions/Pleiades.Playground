// Notices when someone steps in front of the camera, and who, if they were enrolled.

import { useEffect, useRef, useState } from "react"

import { ABSENT_MS, initialArrival, observe } from "./arrival.ts"
import type { Arrival, ArrivalState } from "./arrival.ts"
import { CAMERA, openCamera } from "./camera.ts"
import type { CameraSetting, CameraSource } from "./camera.ts"
import { findFaces } from "./detector.ts"
import type { Face } from "./detector.ts"
import { bestMatch } from "./match.ts"
import type { Person } from "./match.ts"
import { listPeople, onPeopleChange } from "./store.ts"

/** How often the camera is looked at: about twice a second. */
export const LOOK_MS = 500

export type PresenceStatus = "off" | "starting" | "watching" | "error"

export type PresenceOptions = {
  /** Called once when a face appears after `absentMs` without one, with the name if it was recognised. */
  onArrive(person: Arrival): void
  /** While false, the camera is off and nothing is looked at. */
  enabled: boolean
  /** How long nobody must have been there before a face is an arrival; 10 s if omitted. */
  absentMs?: number
  /** Which camera; the one of `CAMERA` if omitted. */
  camera?: CameraSetting
}

export type Presence = {
  status: PresenceStatus
  /** Why the camera or the detector did not start, while `status` is "error". */
  error?: string
  /** Whether a face was in the last picture. */
  face: boolean
}

/**
 * One look at the camera. The detector alone says whether a face is there; who it is is asked only when
 * it is, while an arrival is waiting for a name or about to begin, and someone is enrolled to compare with.
 */
async function look(source: CameraSource, state: ArrivalState, people: ReadonlyArray<Person>): Promise<Array<Face> | undefined> {
  const frame = await source.frame()
  if (!frame) return undefined
  try {
    const faces = await findFaces(frame, { describe: false })
    const waiting = state.pending !== undefined || !state.present
    if (faces.length === 0 || !waiting || people.length === 0) return faces
    return await findFaces(frame, { describe: true })
  } finally {
    if (typeof ImageBitmap !== "undefined" && frame instanceof ImageBitmap) frame.close()
  }
}

/**
 * Watches the camera while `enabled` and calls `onArrive` when someone arrives. While nobody is there,
 * only the detector runs, twice a second, and not at all while the tab is hidden; the descriptor is
 * computed only while an arrival waits for a name. The camera is let go when `enabled` turns false
 * and when the component unmounts.
 */
export function usePresence({ onArrive, enabled, absentMs = ABSENT_MS, camera = CAMERA }: PresenceOptions): Presence {
  const [presence, setPresence] = useState<Presence>({ status: "off", face: false })
  const arrive = useRef(onArrive)
  arrive.current = onArrive
  const setting = JSON.stringify(camera)

  useEffect(() => {
    if (!enabled) {
      setPresence({ status: "off", face: false })
      return
    }
    let cancelled = false
    let source: CameraSource | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let state: ArrivalState = initialArrival
    let people: Array<Person> = []
    let lastFace = false

    const loadPeople = () =>
      listPeople()
        .then((all) => {
          people = all
        })
        .catch(() => undefined)
    const unsubscribe = onPeopleChange(() => void loadPeople())

    const tick = async () => {
      if (cancelled || !source) return
      try {
        if (!document.hidden) {
          const faces = await look(source, state, people)
          if (cancelled) return
          if (faces) {
            const face = faces[0]
            const name = face?.descriptor ? bestMatch(face.descriptor, people)?.name : undefined
            const next = observe(state, Date.now(), { face: face !== undefined, name }, { absentMs })
            state = next.state
            if (lastFace !== (face !== undefined)) {
              lastFace = face !== undefined
              setPresence({ status: "watching", face: lastFace })
            }
            if (next.arrival) arrive.current(next.arrival)
          }
        }
      } catch (error) {
        if (!cancelled) setPresence({ status: "error", error: String(error), face: false })
        return
      }
      if (!cancelled) timer = setTimeout(() => void tick(), LOOK_MS)
    }

    setPresence({ status: "starting", face: false })
    void (async () => {
      try {
        await loadPeople()
        const opened = await openCamera(JSON.parse(setting) as CameraSetting)
        if (cancelled) {
          opened.stop()
          return
        }
        source = opened
        setPresence({ status: "watching", face: false })
        void tick()
      } catch (error) {
        if (!cancelled) setPresence({ status: "error", error: String(error), face: false })
      }
    })()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      unsubscribe()
      source?.stop()
    }
  }, [enabled, absentMs, setting])

  return presence
}
