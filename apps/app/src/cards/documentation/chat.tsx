import { useState } from "react"
import { DocumentationAnswerCard } from "@pleiades/cards/documentation/documentation-answer-card.tsx"
import { documentationAnswerOf } from "@pleiades/cards/documentation/contract.ts"
import type { DocumentationAnswer, DocumentationEvidence } from "@pleiades/cards/documentation/contract.ts"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@pleiades/ui/components/dialog"
import { OriginalPdf, SourcePage } from "../../documentation/chat.tsx"
import type { ChatTool } from "../../chat/tool-results.ts"

function AnswerCard({ value }: { value: DocumentationAnswer }) {
  const [source, setSource] = useState<DocumentationEvidence | null>(null)
  return <>
    <DocumentationAnswerCard value={value} onOpenDocument={setSource} />
    <Dialog open={source !== null} onOpenChange={open => { if (!open) setSource(null) }}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-[92vw]">
        <DialogHeader><DialogTitle className="break-words pr-6">{source?.title}</DialogTitle>
          <DialogDescription>{source ? `${source.chapter ? source.chapter + " · " : ""}p. ${source.pageLabel}` : "Original document"}</DialogDescription></DialogHeader>
        {source && (/\.pdf$/i.test(source.path)
          ? <OriginalPdf source={source} initialHighlight={source.quote} />
          : <SourcePage source={source} />)}
      </DialogContent>
    </Dialog>
  </>
}
export const documentationCardTools: ReadonlyArray<ChatTool> = [{
  name: "docs_review", label: { running: "Comparing documentation sources", done: "Retrieved sources for comparison", failed: "Could not complete source comparison" },
}, {
  name: "docs_answer", label: { running: "Checking the answer evidence", done: "Checked the answer evidence", failed: "Could not verify the answer" },
  draw: content => { const value = documentationAnswerOf(content); return value ? <AnswerCard value={value} /> : null },
  replacesAnswer: true, saveAsPage: false,
}]


export function MissingDocumentationAnswer() {
  return <DocumentationAnswerCard value={{ kind: "documentation-answer", status: "unavailable",
    answer: ["No verified answer is available for this question. Please clarify the machine or documentation package, or retry the source lookup."],
    warnings: [], evidence: null }} onOpenDocument={() => {}} />
}
