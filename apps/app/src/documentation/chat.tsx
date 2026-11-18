import { useServerFn } from "@tanstack/react-start"
import { useEffect, useState } from "react"
import { FileTextIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@pleiades/ui/components/dialog"
import { Trace, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@pleiades/ui/components/trace"
import type { ChatTool } from "../chat/tool-results.ts"
import { getDocumentPage } from "./get-page.ts"
import type { PageAnswer } from "./read-page.ts"
import { sourcesOf } from "./results.ts"
import type { DocumentSource } from "./results.ts"

function SourcePage({ source }: { source: DocumentSource }) {
  const read = useServerFn(getDocumentPage)
  const [answer, setAnswer] = useState<PageAnswer>()
  useEffect(() => {
    let active = true
    read({ data: source.resourceUri }).then(
      value => { if (active) setAnswer(value) },
      () => { if (active) setAnswer({ text: null, error: "The documentation page could not be read. Try opening it again." }) },
    )
    return () => { active = false }
  }, [read, source.resourceUri])
  if (!answer) return <p role="status" className="text-muted-foreground">Reading the source page…</p>
  if (answer.error !== null) return <Alert variant="destructive"><AlertTitle>Source unavailable</AlertTitle><AlertDescription>{answer.error}</AlertDescription></Alert>
  return <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm">{answer.text}</div>
}

function SourceLink({ source }: { source: DocumentSource }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button type="button" title={source.citation} />}>
        <TraceLine><TraceIcon><FileTextIcon /></TraceIcon><TraceTitle>{source.citation.replace(/, page .+$/, "")}</TraceTitle><TraceDescription>p. {source.resourceUri.split("/").at(-1)}</TraceDescription></TraceLine>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle className="break-words pr-6">{source.citation}</DialogTitle><DialogDescription>Extracted text from the cited document page.</DialogDescription></DialogHeader>
        {open && <SourcePage source={source} />}
      </DialogContent>
    </Dialog>
  )
}
function drawSources(content: unknown) {
  const sources = sourcesOf(content)
  return sources.length ? <Trace aria-label="Documentation sources">{sources.map(source => <SourceLink key={source.resourceUri} source={source} />)}</Trace> : null
}
export const documentationTools: ReadonlyArray<ChatTool> = [
  { name: "docs_get_guide", label: { running: "Reading the documentation guide", done: "Read the documentation guide", failed: "Could not read the documentation guide" } },
  { name: "docs_search", label: { running: "Searching the manuals", done: "Searched the manuals", failed: "Could not search the manuals" }, draw: drawSources, saveAsPage: false },
  { name: "docs_read_page", label: { running: "Reading a manual page", done: "Read a manual page", failed: "Could not read the manual page" }, draw: drawSources, saveAsPage: false },
]
