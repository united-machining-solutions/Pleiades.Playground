export type DocumentSource = { resourceUri: string; citation: string; pageLabel?: string }

/** Only a revision-specific documentation page can be opened by this host. */
export function pageUri(value: unknown): string {
  if (typeof value !== "string" || !/^docs:\/\/documents\/[a-f0-9]{64}\/[a-f0-9]{64}\/pages\/[1-9][0-9]{0,6}$/.test(value)) {
    throw new Error("Invalid documentation page reference.")
  }
  return value
}

/** MCP content can reach the harness as JSON text or as an array of text parts. */
export function sourcesOf(content: unknown): Array<DocumentSource> {
  if (typeof content === "string") {
    try { return sourcesOf(JSON.parse(content)) } catch { return [] }
  }
  if (Array.isArray(content)) {
    return unique(content.flatMap(part => part?.type === "text" ? sourcesOf(part.content ?? part.text) : []))
  }
  if (typeof content !== "object" || content === null) return []
  if ("hits" in content && Array.isArray(content.hits)) return unique(content.hits.flatMap(sourcesOf))
  if (!("resourceUri" in content) || !("citation" in content) || typeof content.citation !== "string") return []
  const metadata = "source" in content && typeof content.source === "object" && content.source !== null ? content.source : undefined
  const label = metadata && "pageLabel" in metadata && typeof metadata.pageLabel === "string" ? metadata.pageLabel.trim() : ""
  try { return [{ resourceUri: pageUri(content.resourceUri), citation: content.citation, ...(label ? { pageLabel: label } : {}) }] } catch { return [] }
}
function unique(sources: Array<DocumentSource>) {
  return sources.filter((source, index) => sources.findIndex(other => other.resourceUri === source.resourceUri) === index)
}

/** Printed labels identify evidence; the URI keeps navigation on the physical PDF page. */
export function pageDescription(source: DocumentSource): string {
  const physicalPage = source.resourceUri.split("/").at(-1)!
  const label = source.pageLabel?.trim()
  return label && label !== physicalPage ? `p. ${label} (PDF page ${physicalPage})` : `p. ${physicalPage}`
}
