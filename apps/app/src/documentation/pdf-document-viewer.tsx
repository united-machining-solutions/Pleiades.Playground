import { useEffect, useId, useRef, useState } from "react"
import type { PDFDocumentProxy, RenderTask, TextLayer as PDFTextLayer } from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import "pdfjs-dist/web/pdf_viewer.css"
import { Button } from "@pleiades/ui/components/button"
import { Input } from "@pleiades/ui/components/input"
import { Field, FieldLabel } from "@pleiades/ui/components/field"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"

type Props = { url: string; initialPage?: number; indexedSearch?: (query: string) => Promise<number[]> }

/** Renders original bytes locally; no PDF scripts, embedded HTML or external links are executed. */
export function PdfDocumentViewer({ url, initialPage = 1, indexedSearch }: Props) {
  const id = useId()
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [page, setPage] = useState(initialPage)
  const [pageInput, setPageInput] = useState(String(initialPage))
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(800)
  const [error, setError] = useState<string>()
  const [rendering, setRendering] = useState(false)
  const [query, setQuery] = useState("")
  const [term, setTerm] = useState("")
  const [matches, setMatches] = useState<number[]>([])
  const [matchAt, setMatchAt] = useState(0)
  const [searchStatus, setSearchStatus] = useState("")
  const searchRun = useRef(0)
  const textCache = useRef(new Map<number, string>())
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined
    setPdf(undefined); setError(undefined); textCache.current.clear(); searchRun.current++
    setMatches([]); setSearchStatus(""); setQuery(""); setTerm("")
    void import("pdfjs-dist").then(module => {
      if (!active) return
      module.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      task = module.getDocument({ url, rangeChunkSize: 262144, disableAutoFetch: true, disableStream: true })
      return task.promise.then(document => { if (active) { setPdf(document); setPage(Math.max(1, Math.min(initialPage, document.numPages))) } })
    }).catch(() => { if (active) setError("The original PDF could not be opened. Its revision may have changed or the server may be unavailable. Reopen the document or search again.") })
    return () => { active = false; searchRun.current++; void task?.destroy().catch(() => {}) }
  }, [url, initialPage])

  useEffect(() => { setPageInput(String(page)) }, [page])
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(entries => setWidth(Math.max(240, entries[0].contentRect.width - 24)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pdf || !canvasRef.current || !layerRef.current) return
    let active = true
    let renderingTask: RenderTask | undefined
    let textLayer: PDFTextLayer | undefined
    setRendering(true)
    void (async () => {
      const source = await pdf.getPage(page)
      if (!active) return
      const view = source.getViewport({ scale: width / source.getViewport({ scale: 1 }).width * zoom })
      const canvas = canvasRef.current!
      const layer = layerRef.current!
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(view.width * ratio); canvas.height = Math.floor(view.height * ratio)
      canvas.style.width = `${view.width}px`; canvas.style.height = `${view.height}px`
      layer.replaceChildren()
      layer.style.setProperty("--scale-factor", String(view.scale))
      layer.style.setProperty("--total-scale-factor", String(view.scale))
      const { TextLayer } = await import("pdfjs-dist")
      if (!active) return
      renderingTask = source.render({ canvas, viewport: view, transform: [ratio, 0, 0, ratio, 0, 0] })
      await renderingTask.promise
      if (!active) return
      textLayer = new TextLayer({ textContentSource: await source.getTextContent(), container: layer, viewport: view })
      await textLayer.render()
      if (!active) return
      if (term) {
        for (const span of layer.querySelectorAll("span")) {
          const text = span.textContent ?? ""
          let start = 0, at = text.toLowerCase().indexOf(term.toLowerCase())
          if (at < 0) continue
          span.replaceChildren()
          while (at >= 0) {
            span.append(document.createTextNode(text.slice(start, at)))
            const mark = document.createElement("mark"); mark.textContent = text.slice(at, at + term.length); mark.className = "bg-primary/25 text-transparent"
            span.append(mark); start = at + term.length; at = text.toLowerCase().indexOf(term.toLowerCase(), start)
          }
          span.append(document.createTextNode(text.slice(start)))
        }
      }
    })().catch(() => { if (active) setError("This PDF page could not be rendered. Try another page or reopen the document.") }).finally(() => { if (active) setRendering(false) })
    return () => { active = false; renderingTask?.cancel(); textLayer?.cancel() }
  }, [pdf, page, width, zoom, term])

  const go = (number: number) => { if (pdf && Number.isFinite(number)) setPage(Math.min(pdf.numPages, Math.max(1, Math.trunc(number)))) }
  async function find() {
    if (!pdf) return
    const text = query.trim(); const run = ++searchRun.current
    setTerm(text); setMatches([])
    if (!text) { setSearchStatus(""); return }
    const pages: number[] = []
    try {
      for (let number = 1; number <= pdf.numPages; number++) {
        if (run !== searchRun.current) return
        setSearchStatus(`Searching page ${number} of ${pdf.numPages}…`)
        if (!textCache.current.has(number)) {
          const content = await (await pdf.getPage(number)).getTextContent()
          textCache.current.set(number, content.items.map(item => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").toLowerCase())
        }
        if (textCache.current.get(number)!.includes(text.toLowerCase().replace(/\s+/g, " "))) pages.push(number)
      }
      let indexed: number[] = [], unavailable = false
      if (indexedSearch) { try { indexed = await indexedSearch(text) } catch { unavailable = true } }
      if (run !== searchRun.current) return
      const found = [...new Set([...pages, ...indexed])].filter(number => number > 0 && number <= pdf.numPages).sort((a, b) => a - b)
      setMatches(found); setMatchAt(0); if (found.length) go(found[0])
      setSearchStatus(`${found.length} matching ${found.length === 1 ? "page" : "pages"}.${unavailable ? " OCR search is unavailable; native PDF text was searched." : !indexedSearch ? " Scanned-page matches require completed OCR indexing." : ""}`)
    } catch { if (run === searchRun.current) setSearchStatus("The document search could not finish. Try again.") }
  }
  const moveMatch = (delta: number) => { const next = (matchAt + delta + matches.length) % matches.length; setMatchAt(next); go(matches[next]) }
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" aria-label="PDF navigation">
        <Button variant="outline" size="sm" disabled={!pdf || page <= 1} onClick={() => go(page - 1)}>Previous page</Button>
        <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); go(Number(pageInput)) }}>
          <Field orientation="horizontal" className="w-auto"><FieldLabel htmlFor={`${id}-page`}>Page</FieldLabel><Input id={`${id}-page`} type="number" min={1} max={pdf?.numPages} className="w-24" value={pageInput} onChange={event => setPageInput(event.target.value)} /></Field>
          <span className="text-sm text-muted-foreground">of {pdf?.numPages ?? "…"}</span><Button type="submit" variant="outline" size="sm" disabled={!pdf}>Go</Button>
        </form>
        <Button variant="outline" size="sm" disabled={!pdf || page >= pdf.numPages} onClick={() => go(page + 1)}>Next page</Button>
        <Button variant="outline" size="sm" disabled={zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))} aria-label="Zoom out">−</Button>
        <Button variant="outline" size="sm" onClick={() => setZoom(1)}>Fit width</Button>
        <Button variant="outline" size="sm" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + 0.25))} aria-label="Zoom in">+</Button>
        <Button variant="outline" size="sm" nativeButton={false} render={<a href={url} download />}>Download PDF</Button>
      </div>
      <form className="flex flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); void find() }}>
        <Field orientation="horizontal" className="w-auto"><FieldLabel htmlFor={`${id}-search`}>Find text</FieldLabel><Input id={`${id}-search`} type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} className="w-56" /></Field>
        <Button type="submit" variant="outline" size="sm" disabled={!pdf}>Find</Button>
        <Button variant="outline" size="sm" disabled={!matches.length} onClick={() => moveMatch(-1)}>Previous match</Button>
        <Button variant="outline" size="sm" disabled={!matches.length} onClick={() => moveMatch(1)}>Next match</Button>
        {!!matches.length && <span className="text-sm">{matchAt + 1} of {matches.length}</span>}
      </form>
      <p role="status" className="text-sm text-muted-foreground">{searchStatus || (!pdf ? "Loading original PDF…" : rendering ? `Rendering page ${page}…` : `Original PDF · page ${page} of ${pdf.numPages}`)}</p>
      {error && <Alert variant="destructive"><AlertTitle>PDF unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div ref={viewportRef} className="h-[calc(88vh-18rem)] min-h-32 overflow-auto rounded-md border bg-muted/20 p-3" aria-busy={!pdf || rendering}>
        <div className="relative mx-auto w-fit"><canvas ref={canvasRef} aria-label={`Original PDF page ${page}`} /><div ref={layerRef} className="textLayer" /></div>
      </div>
    </div>
  )
}
