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
import { Spinner } from "@pleiades/ui/components/spinner"
import { PlayIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { JOB } from "./sim.ts"
import { startJob } from "./start-job.ts"

/**
 * Starts the preconfigured job again, after a confirmation: it moves the robot and the milling machine. A job of
 * the cell does not end by itself, so the button is always there: the server resets both channels first.
 */
export function RunJobButton() {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)

  // What happened stays for a few seconds next to the button.
  useEffect(() => {
    if (outcome === null) return
    const timer = setTimeout(() => setOutcome(null), 6_000)
    return () => clearTimeout(timer)
  }, [outcome])

  const run = async () => {
    setSending(true)
    try {
      const answer = await startJob()
      setOutcome(answer.started ? { ok: true, text: "Job started" } : { ok: false, text: answer.error })
    } catch (error) {
      setOutcome({ ok: false, text: String(error) })
    } finally {
      setSending(false)
      setOpen(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {outcome && <span className={outcome.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{outcome.text}</span>}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button size="sm" disabled={sending} />}>
          {sending ? <Spinner /> : <PlayIcon />}
          Run job
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <PlayIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Run the job again?</AlertDialogTitle>
            <AlertDialogDescription>
              Both channels are reset, which stops what runs now. Then the cell starts {JOB.nc_ch1} in channel 0
              (robot) and {JOB.nc_ch2} in channel 1 (milling machine). The robot and the axes move.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={sending} onClick={() => void run()}>
              {sending && <Spinner />}
              Run job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
