import { createMCPClient } from "@tanstack/ai-mcp"
import { furtherServers } from "../chat/mcp-servers.ts"

function connectPdf(url: string) { return createMCPClient({ transport: { type: "http", url }, requestOptions: { timeout: 30000 } }) }
type Client = Awaited<ReturnType<typeof connectPdf>>
export type PdfMetadata = { documentId: string; revision: string; size: number; pageCount: number; path: string; mimeType: "application/pdf"; chunkSize: number }
export function pdfReference(input: URL) {
  const documentId = input.searchParams.get("documentId") ?? ""
  const revision = input.searchParams.get("revision") ?? ""
  if (!/^[a-f0-9]{64}$/.test(documentId) || !/^[a-f0-9]{64}$/.test(revision)) throw new Error("Invalid PDF reference.")
  return { documentId, revision, root: `docs://documents/${documentId}/${revision}` }
}
export function pdfRange(header: string | null, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2])) throw new RangeError("Invalid PDF range.")
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new RangeError("Invalid PDF range.")
  return { start, end, partial: true }
}
export async function pdfMetadata(client: Pick<Client, "readResource">, root: string, signal?: AbortSignal): Promise<PdfMetadata> {
  const uri = `${root}/metadata`
  const response = await client.readResource(uri, { signal })
  const content = response.contents.find(item => item.uri === uri && "text" in item)
  if (!content || !("text" in content)) throw new Error("Missing PDF metadata.")
  const value = JSON.parse(content.text) as PdfMetadata
  if (`docs://documents/${value.documentId}/${value.revision}` !== root || value.mimeType !== "application/pdf" || !Number.isSafeInteger(value.size) || value.size < 1 || !Number.isSafeInteger(value.pageCount) || value.pageCount < 1 || value.chunkSize !== 262144 || typeof value.path !== "string") throw new Error("Invalid PDF metadata.")
  return value
}
export async function pdfChunk(client: Pick<Client, "readResource">, root: string, offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
  const uri = `${root}/original/${offset}/${length}`
  const response = await client.readResource(uri, { signal })
  const content = response.contents.find(item => item.uri === uri && "blob" in item && item.mimeType === "application/octet-stream")
  if (!content || !("blob" in content) || content.blob.length !== 4 * Math.ceil(length / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(content.blob)) throw new Error("Invalid PDF byte resource.")
  const bytes = Buffer.from(content.blob, "base64")
  if (bytes.length !== length) throw new Error("Incomplete PDF byte resource.")
  return new Uint8Array(bytes)
}
/** A same-origin PDF endpoint whose only data connection is to the configured docs MCP server. */
export async function servePdf(request: Request): Promise<Response> {
  let reference: ReturnType<typeof pdfReference>
  const url = new URL(request.url)
  try { reference = pdfReference(url) } catch { return Response.json({ error: "Invalid PDF reference." }, { status: 400 }) }
  const endpoint = furtherServers().docs
  if (!endpoint) return Response.json({ error: "Documentation server is not configured." }, { status: 503 })
  let client: Client | undefined
  let ended = false
  const close = async () => { if (!ended) { ended = true; request.signal.removeEventListener("abort", abort); await client?.close().catch(() => {}) } }
  const abort = () => { void close() }
  try {
    client = await connectPdf(endpoint)
    request.signal.addEventListener("abort", abort, { once: true })
    const meta = await pdfMetadata(client, reference.root, request.signal)
    const query = url.searchParams.get("q")
    if (query !== null) {
      if (!query.trim() || query.length > 200) { await close(); return Response.json({ error: "Provide 1–200 search characters." }, { status: 400 }) }
      const result = await client.callTool("docs_search_document", { documentId: reference.documentId, revision: reference.revision, query }, { signal: request.signal })
      const value = result.structuredContent as { pages?: unknown } | undefined
      if (result.isError || !Array.isArray(value?.pages) || value.pages.some(page => !Number.isInteger(page) || page < 1 || page > meta.pageCount)) throw new Error("Document search unavailable.")
      await close(); return Response.json({ pages: value.pages }, { headers: { "Cache-Control": "no-store" } })
    }
    let range: ReturnType<typeof pdfRange>
    try { range = pdfRange(request.headers.get("range"), meta.size) } catch { await close(); return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${meta.size}` } }) }
    let offset = range.start
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (offset > range.end || ended) { controller.close(); await close(); return }
        try {
          const count = Math.min(meta.chunkSize, range.end - offset + 1)
          const bytes = await pdfChunk(client!, reference.root, offset, count, request.signal)
          controller.enqueue(bytes); offset += count
          if (offset > range.end) { controller.close(); await close() }
        } catch { controller.error(new Error("PDF source changed or became unavailable. Search again.")); await close() }
      },
      cancel: close,
    })
    return new Response(body, { status: range.partial ? 206 : 200, headers: {
      "Content-Type": "application/pdf", "Accept-Ranges": "bytes", "Content-Length": String(range.end - range.start + 1),
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(meta.path.split("/").at(-1) ?? "document.pdf").replaceAll("'", "%27")}`,
      ...(range.partial ? { "Content-Range": `bytes ${range.start}-${range.end}/${meta.size}` } : {}),
    } })
  } catch { await close(); return Response.json({ error: "The original PDF is unavailable or its revision has changed. Search again." }, { status: 502 }) }
}
