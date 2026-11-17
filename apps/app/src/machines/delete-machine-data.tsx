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
import { Button } from "@pleiades/ui/components/button"
import { useRouter } from "@tanstack/react-router"
import { CircleAlertIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { deleteMachine } from "./delete-machine.ts"

/**
 * Deletes the stored values and notifications of a machine, after the person confirmed it. Done, the
 * page goes to the list of machines: the machine is no longer there. If it failed, the dialog stays
 * open and says why.
 */
export function DeleteMachineData({ machine }: { machine: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string>()

  const confirm = async () => {
    setBusy(true)
    setFailed(undefined)
    const outcome = await deleteMachine({ data: machine }).catch((error: unknown) => ({
      ok: false as const,
      reason: error instanceof Error ? error.message : String(error),
    }))
    setBusy(false)
    if (!outcome.ok) {
      setFailed(outcome.reason)
      return
    }
    setOpen(false)
    await router.navigate({ to: "/", search: true })
    await router.invalidate()
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setFailed(undefined)
      }}
    >
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        <Trash2Icon data-icon="inline-start" />
        Delete data
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete the data of {machine}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every stored value and notification of {machine} is deleted, and it leaves the list of machines. This
            cannot be undone. A machine that still reports comes back with its next value.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>That did not work</AlertTitle>
            <AlertDescription>{failed}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Deleting" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
