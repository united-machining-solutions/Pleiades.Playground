import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@pleiades/ui/components/collapsible"
import { Separator } from "@pleiades/ui/components/separator"
import type { DocumentationAnswer, DocumentationEvidence } from "./contract.ts"

const typeLabel = { manufacturer: "Manufacturer", customer: "Customer specification", unclassified: "Unclassified" }
type OpenDocument = (source: DocumentationEvidence) => void

function EvidencePreview({ source, onOpenDocument }: { source: DocumentationEvidence; onOpenDocument: OpenDocument }) {
  return <Collapsible>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Evidence</span>
      <CollapsibleTrigger render={<Button variant="outline" size="sm" className="min-w-0 max-w-full" />}>
        <span className="min-w-0 truncate">{source.shortTitle}</span>
        <span className="shrink-0">· p. {source.pageLabel}</span>
        <span aria-hidden="true">⌄</span>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent className="pt-3">
      <Card size="sm">
        <CardHeader>
          <div><Badge variant="outline">{typeLabel[source.documentType]}</Badge></div>
          <CardTitle className="min-w-0 [overflow-wrap:anywhere]">{source.title}</CardTitle>
          <CardDescription className="break-words">
            {[source.version && `Version ${source.version}`, source.chapter, `p. ${source.pageLabel}`,
              source.pageLabel !== String(source.page) && `(PDF page ${source.page})`].filter(Boolean).join(" · ")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <blockquote className="border-l-2 border-primary bg-evidence p-3 text-sm whitespace-pre-wrap break-words text-evidence-foreground">{source.quote}</blockquote>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Quoted verbatim</span>
          <Button variant="outline" size="sm" onClick={() => onOpenDocument(source)}>Open in document <span aria-hidden="true">→</span></Button>
        </CardFooter>
      </Card>
    </CollapsibleContent>
  </Collapsible>
}

/** Warnings first; ordinary answers have one source, conflicts expose every competing passage. */
export function DocumentationAnswerCard({ value, onOpenDocument }: { value: DocumentationAnswer; onOpenDocument: OpenDocument }) {
  const review = value.status === "supported" ? value.review : undefined
  const conflicts = review?.conflicts ?? []
  const hasConflict = review?.state === "conflict"
  const complete = review?.complete === true
  const title = hasConflict ? "Conflicting requirements" : "Review incomplete"
  const statusSymbol = hasConflict ? "⇄" : "?"
  return <Card size="sm" className="@container min-w-0" aria-label="Documentation answer">
    <CardHeader className="sr-only"><CardTitle>Documentation answer</CardTitle><CardDescription>Answer and source review</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      {value.warnings.map((warning, index) => {
        const source = value.status === "supported" ? value.warningSources?.find(item => item.text === warning)?.evidence : undefined
        return <Alert key={index} variant="destructive">
          <AlertTitle>Source warning</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p className="whitespace-pre-wrap">{warning}</p>
            {source && <div><Button variant="outline" size="sm" aria-label={`Warning source: ${source.title}, page ${source.pageLabel}`} onClick={() => onOpenDocument(source)}>Warning source · p. {source.pageLabel}</Button></div>}
          </AlertDescription>
        </Alert>
      })}
      {(hasConflict || !complete) && <div role="status" className="flex flex-wrap items-center gap-2">
        <Badge variant={hasConflict ? "destructive" : "outline"}><span aria-hidden="true">{statusSymbol}</span>{title}</Badge>
        {hasConflict && !complete && <Badge variant="outline"><span aria-hidden="true">?</span>Review incomplete</Badge>}
      </div>}
      {(!complete || hasConflict) && <Alert>
        <AlertTitle>{hasConflict ? "The sources give different requirements" : "The source comparison is incomplete"}</AlertTitle>
        <AlertDescription className="whitespace-pre-wrap break-words">{review?.explanation || "No current package-wide review is available for this answer. Ask again to check the sources."}</AlertDescription>
      </Alert>}
      {hasConflict ? conflicts.map((conflict, conflictIndex) => <section key={conflictIndex} aria-label={conflict.topic} className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">{conflict.topic}</h3>
        <div className="grid min-w-0 gap-3 @lg:grid-cols-2">
          {conflict.alternatives.map((alternative, index) => <Card key={index} size="sm" className="min-w-0 data-[recommended=true]:ring-2 data-[recommended=true]:ring-primary" data-recommended={conflict.resolution.recommendedIndex === index}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline">{typeLabel[alternative.evidence.documentType]}</Badge>
                {conflict.resolution.recommendedIndex === index && <Badge><span aria-hidden="true">✓</span>Recommended</Badge>}
              </div>
              <CardTitle className="whitespace-pre-wrap break-words">{alternative.statement}</CardTitle>
              <CardDescription className="break-words">{alternative.evidence.chapter || alternative.evidence.shortTitle}</CardDescription>
            </CardHeader>
            <CardContent><EvidencePreview source={alternative.evidence} onOpenDocument={onOpenDocument} /></CardContent>
            <CardFooter className="sr-only">{alternative.evidence.citation}</CardFooter>
          </Card>)}
        </div>
        <Alert>
          <AlertTitle>{conflict.resolution.recommendedIndex === null ? "Clarification required" : "Recommendation"}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            {conflict.resolution.recommendedIndex !== null && <p>{conflict.alternatives[conflict.resolution.recommendedIndex].statement}</p>}
            <p className="whitespace-pre-wrap break-words">{conflict.resolution.reason}</p>
            {conflict.resolution.recommendedIndex === null && <p>Have the responsible technical team clarify the applicable requirement and any documented approval before proceeding.</p>}
          </AlertDescription>
        </Alert>
      </section>) : <>
        {value.status === "supported" && value.answer.length > 1 ? <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
          {value.answer.map((paragraph, index) => <li key={index} className="whitespace-pre-wrap break-words">{paragraph}</li>)}
        </ol> : <p className="whitespace-pre-wrap break-words text-sm">{value.answer[0]}</p>}
        {value.evidence && <><Separator /><EvidencePreview source={value.evidence} onOpenDocument={onOpenDocument} /></>}
      </>}
      {complete && !hasConflict && <p className="text-xs text-muted-foreground">No contradiction found in the retrieved passages. This does not exclude contradictions elsewhere.</p>}
    </CardContent>
    <CardFooter className="sr-only">{hasConflict ? "Multiple competing source passages" : value.evidence?.citation || "No supporting source available"}</CardFooter>
  </Card>
}
