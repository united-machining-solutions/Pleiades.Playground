import { z } from "zod"

const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const documentationEvidence = z.object({
  documentId: hash, revision: hash, packageName: z.string().min(1), path: z.string().min(1),
  page: z.number().int().positive(), pageLabel: z.string().min(1), method: z.enum(["text", "ocr"]),
  documentType: z.enum(["manufacturer", "customer", "unclassified"]),
  title: z.string().min(1), shortTitle: z.string().min(1),
  chapter: z.string().nullable(), version: z.string().nullable(),
  quote: z.string().min(1).max(4000), citation: z.string().min(1), resourceUri: z.string(),
}).refine(source => source.resourceUri === `docs://documents/${source.documentId}/${source.revision}/pages/${source.page}`, {
  message: "Evidence URI must identify the exact document revision and physical page.",
})
export const documentationReview = z.object({
  state: z.enum(["no_conflict", "conflict", "incomplete"]), complete: z.boolean(), explanation: z.string().max(12000),
  conflicts: z.array(z.object({
    topic: z.string().min(1).max(500),
    alternatives: z.array(z.object({ statement: z.string().min(1).max(2000), evidence: documentationEvidence })).min(2).max(8),
    resolution: z.object({ rule: z.enum(["clarification", "stricter_compatible", "manufacturer_constraint"]),
      reason: z.string().min(1).max(3000), recommendedIndex: z.number().int().nonnegative().nullable() }),
  })).max(6),
}).superRefine((review, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message })
  if ((review.state === "conflict") !== (review.conflicts.length > 0)) invalid("Conflicts must remain visible.")
  if (review.state === "no_conflict" && !review.complete) invalid("No-contradiction state requires completed review.")
  if (review.state === "incomplete" && review.complete) invalid("Incomplete state cannot claim completion.")
  for (const conflict of review.conflicts) {
    const selected = conflict.resolution.recommendedIndex
    if ((conflict.resolution.rule === "clarification") !== (selected === null)) invalid("Clarification must not recommend a source.")
    if (selected !== null && (!review.complete || selected >= conflict.alternatives.length)) invalid("Invalid recommendation or incomplete review.")
    const identities = conflict.alternatives.map(item => JSON.stringify([item.evidence.resourceUri, item.evidence.quote.replace(/\s+/g, " ").trim()]))
    if (new Set(identities).size !== identities.length) invalid("Alternatives must cite distinct passages.")
    if (conflict.resolution.rule === "manufacturer_constraint" && selected !== null &&
      (conflict.alternatives[selected]?.evidence.documentType !== "manufacturer" ||
      conflict.alternatives.filter(item => item.evidence.documentType === "manufacturer").length !== 1 ||
      conflict.alternatives.some(item => item.evidence.documentType === "unclassified"))) invalid("Manufacturer precedence is ambiguous.")
  }
})
export const documentationAnswer = z.discriminatedUnion("status", [
  z.object({ kind: z.literal("documentation-answer"), status: z.literal("supported"),
    answer: z.array(z.string().min(1)).min(1).max(12), warnings: z.array(z.string().min(1)), evidence: documentationEvidence, review: documentationReview.optional(),
    warningSources: z.array(z.object({ text: z.string().min(1).max(4000), evidence: documentationEvidence })
      .refine(source => source.text === source.evidence.quote, { message: "Warning must retain its exact source quote." })).max(8).optional() }),
  z.object({ kind: z.literal("documentation-answer"), status: z.literal("unavailable"),
    answer: z.array(z.string().min(1)).length(1), warnings: z.array(z.string()).length(0), evidence: z.null() }),
]).superRefine((answer, ctx) => {
  if (answer.status !== "supported") return
  if (answer.warningSources?.some(source => source.evidence.packageName !== answer.evidence.packageName || !answer.warnings.includes(source.text))) {
    ctx.addIssue({ code: "custom", message: "Warning references must belong to this package and a displayed verbatim warning." })
  }
  if (answer.review?.conflicts.some(conflict => conflict.alternatives.some(item => item.evidence.packageName !== answer.evidence.packageName))) {
    ctx.addIssue({ code: "custom", message: "All alternatives must belong to the selected package." })
  }
})
export type DocumentationAnswer = z.infer<typeof documentationAnswer>
export type DocumentationEvidence = z.infer<typeof documentationEvidence>

/** Accept the MCP JSON text and harness text-part representations, never arbitrary markup. */
export function documentationAnswerOf(content: unknown): DocumentationAnswer | null {
  if (typeof content === "string") {
    try { return documentationAnswerOf(JSON.parse(content)) } catch { return null }
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type !== "text") continue
      const answer = documentationAnswerOf(part.content ?? part.text)
      if (answer) return answer
    }
    return null
  }
  const parsed = documentationAnswer.safeParse(content)
  return parsed.success ? parsed.data : null
}
