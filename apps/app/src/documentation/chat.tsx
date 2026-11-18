import { useServerFn } from "@tanstack/react-start"
import { useCallback, useEffect, useState } from "react"
import { FileTextIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@pleiades/ui/components/dialog"
import { Trace, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@pleiades/ui/components/trace"
import type { ChatTool } from "../chat/tool-results.ts"
import { PdfDocumentViewer } from "./pdf-document-viewer.tsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pleiades/ui/components/tabs"
import { getDocumentPage } from "./get-page.ts"
import type { PageAnswer } from "./read-page.ts"
import { pageDescription, sourcesOf } from "./results.ts"
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

function OriginalPdf({ source }: { source: DocumentSource }) {
  const parts = source.resourceUri.split("/")
  const url = `/api/documentation/pdf?${new URLSearchParams({ documentId: parts[3], revision: parts[4] })}`
  const indexedSearch = useCallback(async (query: string) => {
    const response = await fetch(`${url}&${new URLSearchParams({ q: query })}`)
    if (!response.ok) throw new Error("Document search unavailable")
    return ((await response.json()) as { pages: number[] }).pages
  }, [url])
  return <PdfDocumentViewer url={url} initialPage={Number(parts[6])} indexedSearch={indexedSearch} />
}

function SourceLink({ source }: { source: DocumentSource }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button type="button" title={source.citation} />}>
        <TraceLine><TraceIcon><FileTextIcon /></TraceIcon><TraceTitle>{source.citation.replace(/, page .+$/, "")}</TraceTitle><TraceDescription>{pageDescription(source)}</TraceDescription></TraceLine>
      </DialogTrigger>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-[92vw]">
        <DialogHeader><DialogTitle className="break-words pr-6">{source.citation}</DialogTitle><DialogDescription>Original document and extracted text for the cited page.</DialogDescription></DialogHeader>
        {open && <Tabs defaultValue={/\.pdf(?:,|$)/i.test(source.citation) ? "pdf" : "text"}>
          <TabsList><TabsTrigger value="pdf" disabled={!/\.pdf(?:,|$)/i.test(source.citation)}>Original PDF</TabsTrigger><TabsTrigger value="text">Extracted text</TabsTrigger></TabsList>
          <TabsContent value="pdf"><OriginalPdf source={source} /></TabsContent>
          <TabsContent value="text"><SourcePage source={source} /></TabsContent>
        </Tabs>}
      </DialogContent>
    </Dialog>
  )
}
function drawSources(content: unknown) {
  const sources = sourcesOf(content)
  return sources.length ? <Trace aria-label="Documentation sources">{sources.map(source => <SourceLink key={source.resourceUri} source={source} />)}</Trace> : null
}
export const documentationTools: ReadonlyArray<ChatTool> = [
  { name: "docs_get_document", label: { running: "Reading document details", done: "Read document details", failed: "Could not read document details" } },
  { name: "docs_search_document", label: { running: "Finding text in a manual", done: "Found matching manual pages", failed: "Could not search the manual" } },
  { name: "docs_get_guide", label: { running: "Reading the documentation guide", done: "Read the documentation guide", failed: "Could not read the documentation guide" } },
  { name: "docs_search", label: { running: "Searching the manuals", done: "Searched the manuals", failed: "Could not search the manuals" }, draw: drawSources, saveAsPage: false },
  { name: "docs_read_page", label: { running: "Reading a manual page", done: "Read a manual page", failed: "Could not read the manual page" }, draw: drawSources, saveAsPage: false },
]
