import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@pleiades/ui/components/alert-dialog"
import { AspectRatio } from "@pleiades/ui/components/aspect-ratio"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@pleiades/ui/components/field"
import { Input } from "@pleiades/ui/components/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@pleiades/ui/components/item"
import { Progress, ProgressLabel, ProgressValue } from "@pleiades/ui/components/progress"
import { Spinner } from "@pleiades/ui/components/spinner"
import { createFileRoute } from "@tanstack/react-router"
import { CircleAlertIcon, LockIcon, ScanFaceIcon, Trash2Icon, VideoOffIcon } from "lucide-react"
import { Fragment, useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"

import { openCamera } from "@/titan/faces/camera.ts"
import type { CameraSource } from "@/titan/faces/camera.ts"
import { captureDescriptors, loadDetector, lookAt } from "@/titan/faces/detector.ts"
import { bestMatch } from "@/titan/faces/match.ts"
import { addPerson, deleteAllPeople, deletePerson, listPeople, onPeopleChange } from "@/titan/faces/store.ts"
import type { EnrolledPerson } from "@/titan/faces/store.ts"

/**
 * Enrols the faces Titan recognises, and shows whom it recognises now. Everything happens in this
 * browser: the descriptors of the faces are kept in its IndexedDB and are sent nowhere.
 */
export const Route = createFileRoute("/titan/gesichter")({
  staticData: { nav: { title: "Gesichter", icon: ScanFaceIcon, order: 2 } },
  component: Faces,
})

/** Pictures taken to enrol a face, about three a second. */
const PICTURES = 10
/** How often the test line looks at the camera. */
const LOOK_MS = 500

type Camera = { status: "starting" } | { status: "on"; source: CameraSource } | { status: "error"; error: string }

type Seen = { kind: "nobody" } | { kind: "unknown" } | { kind: "known"; name: string; similarity: number }

function Faces() {
  const [camera, setCamera] = useState<Camera>({ status: "starting" })
  const [models, setModels] = useState<"loading" | "ready" | string>("loading")
  const [people, setPeople] = useState<Array<EnrolledPerson>>([])
  const [seen, setSeen] = useState<Seen>({ kind: "nobody" })
  const [name, setName] = useState("")
  const [taken, setTaken] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  // The test line pauses while a face is enrolled: both would ask the detector at once.
  const capturing = useRef(false)
  const peopleRef = useRef(people)
  peopleRef.current = people

  // The list of people, now and whenever it changes, here or in another tab.
  useEffect(() => {
    const load = () => void listPeople().then(setPeople, (reason: unknown) => setError(String(reason)))
    load()
    return onPeopleChange(load)
  }, [])

  // The camera and the models, while the page is open.
  useEffect(() => {
    let cancelled = false
    let source: CameraSource | undefined
    openCamera().then(
      (opened) => {
        if (cancelled) return opened.stop()
        source = opened
        setCamera({ status: "on", source: opened })
      },
      (reason: unknown) => !cancelled && setCamera({ status: "error", error: String(reason) }),
    )
    loadDetector().then(
      () => !cancelled && setModels("ready"),
      (reason: unknown) => !cancelled && setModels(String(reason)),
    )
    return () => {
      cancelled = true
      source?.stop()
    }
  }, [])

  // Whom the camera sees now, twice a second.
  const source = camera.status === "on" ? camera.source : undefined
  useEffect(() => {
    if (!source || models !== "ready") return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (!capturing.current && !document.hidden) {
        const all = peopleRef.current
        const faces = await lookAt(source, { describe: all.length > 0 }).catch(() => undefined)
        if (cancelled) return
        if (faces) {
          const face = faces[0]
          const match = face?.descriptor ? bestMatch(face.descriptor, all) : undefined
          setSeen(
            !face ? { kind: "nobody" } : match ? { kind: "known", ...match } : { kind: "unknown" },
          )
        }
      }
      if (!cancelled) timer = setTimeout(() => void tick(), LOOK_MS)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [source, models])

  async function enrol(event: FormEvent) {
    event.preventDefault()
    if (!source || !name.trim()) return
    setError(undefined)
    capturing.current = true
    setTaken(0)
    try {
      const descriptors = await captureDescriptors(source, { count: PICTURES, onProgress: setTaken })
      await addPerson(name, descriptors)
      setName("")
    } catch (reason) {
      setError(
        String(reason).includes("exactly one face")
          ? "Es war nicht oft genug genau ein Gesicht im Bild. Bitte allein und gut beleuchtet vor die Kamera treten und es noch einmal versuchen."
          : String(reason),
      )
    } finally {
      capturing.current = false
      setTaken(undefined)
    }
  }

  const ready = camera.status === "on" && models === "ready"
  const busy = taken !== undefined

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Gesichter</h1>
        <p className="text-sm text-muted-foreground">Wen Titan erkennt, wenn jemand vor die Kamera tritt.</p>
      </div>

      <Alert>
        <LockIcon />
        <AlertTitle>Bleibt in diesem Browser</AlertTitle>
        <AlertDescription>
          Die Gesichtsmerkmale werden nur in diesem Browser auf diesem PC gespeichert und nirgendwohin gesendet,
          weder an den Server noch an den Hub. Fotos werden nicht aufbewahrt.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kamera</CardTitle>
            <CardDescription>
              <RecognisedLine ready={ready} models={models} seen={seen} cameraError={camera.status === "error"} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Preview camera={camera} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Einlernen</CardTitle>
            <CardDescription>Allein vor die Kamera treten und den Kopf leicht drehen.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void enrol(event)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="face-name">Name</FieldLabel>
                  <Input
                    id="face-name"
                    placeholder="Vorname"
                    autoComplete="off"
                    value={name}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <FieldDescription>Ein Name, der schon da ist, bekommt die neuen Bilder dazu.</FieldDescription>
                </Field>
                {busy ? (
                  <Progress value={(taken / PICTURES) * 100}>
                    <ProgressLabel>
                      Bild {taken} von {PICTURES}
                    </ProgressLabel>
                    <ProgressValue />
                  </Progress>
                ) : (
                  <Field orientation="horizontal">
                    <Button type="submit" disabled={!ready || !name.trim()}>
                      <ScanFaceIcon data-icon="inline-start" />
                      Gesicht einlernen
                    </Button>
                  </Field>
                )}
              </FieldGroup>
            </form>
            {error && (
              <Alert variant="destructive" className="mt-4">
                <CircleAlertIcon />
                <AlertTitle>Das hat nicht geklappt</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <People people={people} onError={setError} />
    </div>
  )
}

function RecognisedLine({ ready, models, seen, cameraError }: { ready: boolean; models: string; seen: Seen; cameraError: boolean }) {
  if (models !== "loading" && models !== "ready") return <>Die Modelle konnten nicht geladen werden: {models}</>
  if (cameraError) return <>Ohne Kamera erkennt Titan niemanden.</>
  if (!ready) {
    return (
      <span className="inline-flex items-center gap-2">
        <Spinner /> Kamera und Modelle werden geladen …
      </span>
    )
  }
  if (seen.kind === "nobody") return <>Kein Gesicht im Bild</>
  return (
    <span className="inline-flex items-center gap-2">
      Erkannt:
      {seen.kind === "known" ? (
        <Badge>
          {seen.name} · {Math.round(seen.similarity * 100)} %
        </Badge>
      ) : (
        <Badge variant="outline">Unbekannt</Badge>
      )}
    </span>
  )
}

/** The picture of the camera, mirrored like a mirror. A camera without a stream shows no picture here. */
function Preview({ camera }: { camera: Camera }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = camera.status === "on" && "stream" in camera.source ? (camera.source.stream as MediaStream) : null

  useEffect(() => {
    if (video.current) video.current.srcObject = stream
  }, [stream])

  if (camera.status === "error" || (camera.status === "on" && !stream)) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <VideoOffIcon />
          </EmptyMedia>
          <EmptyTitle>Kein Kamerabild</EmptyTitle>
          <EmptyDescription>
            {camera.status === "error"
              ? camera.error.includes("NotAllowedError")
                ? "Der Browser hat den Zugriff auf die Kamera nicht erlaubt. Bitte in der Adresszeile freigeben und die Seite neu laden."
                : `Die Kamera ließ sich nicht öffnen: ${camera.error}`
              : "Diese Kamera liefert Einzelbilder und hat hier keine Vorschau."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <AspectRatio ratio={4 / 3} className="overflow-hidden rounded-md bg-muted">
      <video ref={video} autoPlay muted playsInline className="size-full -scale-x-100 object-cover" />
    </AspectRatio>
  )
}

function People({ people, onError }: { people: ReadonlyArray<EnrolledPerson>; onError: (error: string) => void }) {
  const [open, setOpen] = useState(false)
  const remove = (name: string) => void deletePerson(name).catch((reason: unknown) => onError(String(reason)))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Eingelernt</CardTitle>
        <CardDescription>
          {people.length === 0
            ? "Noch niemand."
            : people.length === 1
              ? "Eine Person."
              : `${people.length} Personen.`}
        </CardDescription>
      </CardHeader>
      {people.length > 0 && (
        <CardContent className="flex flex-col gap-4">
          <ItemGroup>
            {people.map((person, index) => (
              <Fragment key={person.name}>
                {index > 0 && <ItemSeparator />}
                <Item>
                  <ItemContent>
                    <ItemTitle>{person.name}</ItemTitle>
                    <ItemDescription>
                      {person.descriptors.length} Bilder · {new Date(person.enrolledAt).toLocaleString("de-DE")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${person.name} löschen`}
                      onClick={() => remove(person.name)}
                    >
                      <Trash2Icon />
                    </Button>
                  </ItemActions>
                </Item>
              </Fragment>
            ))}
          </ItemGroup>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger render={<Button variant="outline" className="self-start" />}>
              Alle löschen
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <Trash2Icon />
                </AlertDialogMedia>
                <AlertDialogTitle>Alle Gesichter löschen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Titan erkennt danach niemanden mehr, bis wieder jemand eingelernt ist. Das lässt sich nicht
                  rückgängig machen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Behalten</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    setOpen(false)
                    void deleteAllPeople().catch((reason: unknown) => onError(String(reason)))
                  }}
                >
                  Alle löschen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      )}
    </Card>
  )
}
