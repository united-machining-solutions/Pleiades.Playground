import { useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy, RenderTask, TextLayer as PDFTextLayer } from "pdfjs-dist"
import { highlightRectangles } from "./highlight.ts"
import type { HighlightRect } from "./highlight.ts"

type Props = {
  pdf: PDFDocumentProxy
  page: number
  width: number
  ratio: number
  term: string
  root: HTMLDivElement | null
  priority: boolean
  onReady: (page: number, highlights: HighlightRect[], term: string) => void
}

/** Keep every page in the scroll layout; allocate canvases only near the viewport. */
export function PdfPage({ pdf, page, width, ratio, term, root, priority, onReady }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  const visible = near || priority
  const renderedLayer = useRef<HTMLDivElement | null>(null)
  const [pageRatio, setPageRatio] = useState(ratio)
  const [error, setError] = useState(false)
  const [renderedWidth, setRenderedWidth] = useState<number>()
  const [highlights, setHighlights] = useState<HighlightRect[]>([])

  useEffect(() => {
    if (!root || !holder.current) return
    const observer = new IntersectionObserver(entries => setNear(entries[0].isIntersecting), { root, rootMargin: "100% 0px" })
    observer.observe(holder.current)
    return () => observer.disconnect()
  }, [root])

  useEffect(() => {
    if (!visible) return
    let active = true
    let task: RenderTask | undefined
    let textLayer: PDFTextLayer | undefined
    renderedLayer.current = null
    setError(false); setHighlights([]); setRenderedWidth(undefined)
    void (async () => {
      const source = await pdf.getPage(page)
      if (!active) return
      const view = source.getViewport({ scale: width / source.getViewport({ scale: 1 }).width })
      setPageRatio(view.height / view.width)
      const canvas = canvasRef.current!, layer = layerRef.current!
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(view.width * pixelRatio); canvas.height = Math.floor(view.height * pixelRatio)
      canvas.style.width = `${view.width}px`; canvas.style.height = `${view.height}px`
      layer.replaceChildren()
      layer.style.setProperty("--scale-factor", String(view.scale))
      layer.style.setProperty("--total-scale-factor", String(view.scale))
      const { TextLayer } = await import("pdfjs-dist")
      if (!active) return
      task = source.render({ canvas, viewport: view, transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] })
      await task.promise
      if (!active) return
      const content = await source.getTextContent()
      if (!active) return
      textLayer = new TextLayer({ textContentSource: content, container: layer, viewport: view })
      await textLayer.render()
      if (!active) return
      renderedLayer.current = layer
      setRenderedWidth(width)
    })().catch(() => { if (active) setError(true) })
    return () => { active = false; renderedLayer.current = null; task?.cancel(); textLayer?.cancel() }
  }, [pdf, page, width, visible])

  // Changing a search term must not start another PDF render on a busy canvas.
  useEffect(() => {
    if (!visible || renderedWidth !== width || !layerRef.current || renderedLayer.current !== layerRef.current) return
    const rectangles = term ? highlightRectangles(layerRef.current, term) : []
    setHighlights(rectangles)
    onReady(page, rectangles, term)
  }, [visible, renderedWidth, width, page, term, onReady])

  return (
    <div ref={holder} className="relative isolate shrink-0 bg-background shadow-sm" style={{ width, height: width * pageRatio }} role="group" aria-label={`PDF page ${page}`}>
      {visible && <>
        <canvas key={`canvas-${width}`} ref={canvasRef} style={{ position: "relative", zIndex: 0 }} aria-label={`Original PDF page ${page}`} />
        {/* Translucent rectangles preserve the canvas glyphs and leave selection text untouched. */}
        <div key={`highlights-${width}`} aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ zIndex: 1 }}>
          {highlights.map((rect, index) => <div key={index} data-pdf-highlight data-highlight-term={term}
            className="absolute bg-evidence/40" style={rect} />)}
        </div>
        <div key={`text-${width}`} ref={layerRef} className="textLayer" style={{ zIndex: 2 }} />
      </>}
      {error && <p role="alert" className="absolute inset-x-0 top-0 p-3 text-sm text-destructive">Page {page} could not be rendered. Scroll away and back to retry.</p>}
    </div>
  )
}
