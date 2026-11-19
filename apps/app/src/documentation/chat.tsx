import { useServerFn } from "@tanstack/react-start"
import { useCallback, useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import type { ChatTool } from "../chat/tool-results.ts"
import { PdfDocumentViewer } from "./pdf-document-viewer.tsx"
import { getDocumentPage } from "./get-page.ts"
import type { PageAnswer } from "./read-page.ts"
import type { DocumentSource } from "./results.ts"

export function SourcePage({ source }: { source: DocumentSource }) {
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

export function OriginalPdf({ source, initialHighlight }: { source: DocumentSource; initialHighlight?: string }) {
  const parts = source.resourceUri.split("/")
  const url = `/api/documentation/pdf?${new URLSearchParams({ documentId: parts[3], revision: parts[4] })}`
  const indexedSearch = useCallback(async (query: string) => {
    const response = await fetch(`${url}&${new URLSearchParams({ q: query })}`)
    if (!response.ok) throw new Error("Document search unavailable")
    return ((await response.json()) as { pages: number[] }).pages
  }, [url])
  return <PdfDocumentViewer url={url} initialPage={Number(parts[6])} initialHighlight={initialHighlight} indexedSearch={indexedSearch} />
}

export const documentationTools: ReadonlyArray<ChatTool> = [
  { name: "docs_list_packages", label: { running: "Finding documentation packages", done: "Found documentation packages", failed: "Could not list documentation packages" } },
  { name: "docs_get_document", label: { running: "Reading document details", done: "Read document details", failed: "Could not read document details" } },
  { name: "docs_search_document", label: { running: "Finding text in a manual", done: "Found matching manual pages", failed: "Could not search the manual" } },
  { name: "docs_get_guide", label: { running: "Reading the documentation guide", done: "Read the documentation guide", failed: "Could not read the documentation guide" } },
  { name: "docs_search", label: { running: "Searching the manuals", done: "Searched the manuals", failed: "Could not search the manuals" }, saveAsPage: false },
  { name: "docs_read_page", label: { running: "Reading a manual page", done: "Read a manual page", failed: "Could not read the manual page" }, saveAsPage: false },
]
