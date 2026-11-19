import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import type { ComponentProps } from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, SearchIcon, ZoomInIcon, ZoomOutIcon, ScanLineIcon } from "lucide-react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import "pdfjs-dist/web/pdf_viewer.css"
import { PdfPage } from "./pdf-page.tsx"
import type { HighlightRect } from "./highlight.ts"
import { Button } from "@pleiades/ui/components/button"
import { Input } from "@pleiades/ui/components/input"
import { Field, FieldGroup, FieldLabel } from "@pleiades/ui/components/field"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@pleiades/ui/components/tooltip"

function ToolbarButton({ label, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} {...props} />} /><TooltipContent>{label}</TooltipContent></Tooltip>
}

type Props = { url: string; initialPage?: number; initialHighlight?: string; indexedSearch?: (query: string) => Promise<number[]> }

/** Renders original bytes locally; no PDF scripts, embedded HTML or external links are executed. */
export function PdfDocumentViewer({ url, initialPage = 1, initialHighlight = "", indexedSearch }: Props) {
  const id = useId()
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [page, setPage] = useState(initialPage)
  const [pageInput, setPageInput] = useState(String(initialPage))
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(800)
  const [error, setError] = useState<string>()
  const [pageRatio, setPageRatio] = useState(1.414)
  const [query, setQuery] = useState("")
  const [term, setTerm] = useState("")
  const [matches, setMatches] = useState<number[]>([])
  const [matchAt, setMatchAt] = useState(0)
  const [highlightStatus, setHighlightStatus] = useState("")
  const [searchStatus, setSearchStatus] = useState("")
  const searchRun = useRef(0)
  const textCache = useRef(new Map<number, string>())
  const viewportRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const currentPage = useRef(initialPage)
  const pageOffset = useRef(0)
  const layoutAnchor = useRef<{ page: number; fraction: number } | null>(null)
  const focusTarget = useRef<{ page: number; term: string } | null>(null)
  const quotePage = useRef(initialPage)

  const pageReady = useCallback((number: number, rectangles: HighlightRect[], renderedTerm: string) => {
    if (initialHighlight && number === quotePage.current && renderedTerm === initialHighlight) {
      setHighlightStatus(rectangles.length ? "The quoted passage is highlighted." : "The cited page is shown. This passage has no matching native PDF text; scanned text has no highlight coordinates.")
    }
    const pending = focusTarget.current
    const viewport = viewportRef.current
    const holder = pagesRef.current?.children[number - 1] as HTMLElement | undefined
    if (!pending || pending.page !== number || pending.term !== renderedTerm || !viewport || !holder) return
    if (rectangles.length) {
      viewport.scrollTop += holder.getBoundingClientRect().top - viewport.getBoundingClientRect().top
        + rectangles[0].top - Math.min(80, viewport.clientHeight / 4)
    }
    pageOffset.current = Math.max(0, (viewport.scrollTop - holder.offsetTop) / holder.offsetHeight)
    focusTarget.current = null
  }, [initialHighlight])
  const scrollFrame = useRef<number | undefined>(undefined)

  useEffect(() => {
    let active = true
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined
    setPdf(undefined); setError(undefined); textCache.current.clear(); searchRun.current++
    setMatches([]); setSearchStatus(""); setQuery(""); setTerm(initialHighlight); setHighlightStatus("")
    focusTarget.current = { page: initialPage, term: initialHighlight }
    void import("pdfjs-dist").then(module => {
      if (!active) return
      module.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
      task = module.getDocument({ url, rangeChunkSize: 262144, disableAutoFetch: true, disableStream: true })
      return task.promise.then(async document => {
        const first = await document.getPage(1)
        const view = first.getViewport({ scale: 1 })
        if (active) {
          setPageRatio(view.height / view.width)
          currentPage.current = Math.max(1, Math.min(initialPage, document.numPages))
          pageOffset.current = 0
          layoutAnchor.current = { page: currentPage.current, fraction: 0 }
          quotePage.current = currentPage.current
          focusTarget.current = { page: currentPage.current, term: initialHighlight }
          setPage(currentPage.current); setPdf(document)
        }
      })
    }).catch(() => { if (active) setError("The original PDF could not be opened. Its revision may have changed or the server may be unavailable. Reopen the document or search again.") })
    return () => { active = false; searchRun.current++; void task?.destroy().catch(() => {}) }
  }, [url, initialPage, initialHighlight])

  useEffect(() => { setPageInput(String(page)) }, [page])
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(entries => {
      layoutAnchor.current = { page: currentPage.current, fraction: pageOffset.current }
      setWidth(Math.max(240, entries[0].contentRect.width - 24))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Keep the current physical page anchored when the document, viewport width or zoom changes.
  useLayoutEffect(() => {
    const anchor = layoutAnchor.current ?? { page: currentPage.current, fraction: pageOffset.current }
    const target = pagesRef.current?.children[anchor.page - 1] as HTMLElement | undefined
    if (target && viewportRef.current) {
      viewportRef.current.scrollTop = target.offsetTop + anchor.fraction * target.offsetHeight
      currentPage.current = anchor.page
      pageOffset.current = anchor.fraction
      setPage(anchor.page)
    }
    layoutAnchor.current = null
  }, [pdf, width, zoom])
  useEffect(() => () => { if (scrollFrame.current !== undefined) cancelAnimationFrame(scrollFrame.current) }, [])

  function updateVisiblePage() {
    if (scrollFrame.current !== undefined) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = undefined
      const viewport = viewportRef.current, pages = pagesRef.current?.children
      if (!viewport || !pages?.length) return
      const position = viewport.scrollTop + Math.min(40, viewport.clientHeight / 10)
      let low = 0, high = pages.length - 1
      while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if ((pages[middle] as HTMLElement).offsetTop <= position) low = middle
        else high = middle - 1
      }
      currentPage.current = low + 1
      const holder = pages[low] as HTMLElement
      pageOffset.current = Math.max(0, (viewport.scrollTop - holder.offsetTop) / holder.offsetHeight)
      setPage(low + 1)
    })
  }
  const go = (number: number, focusMatch = false, matchTerm = term) => {
    if (!pdf || !Number.isFinite(number)) return
    const targetPage = Math.min(pdf.numPages, Math.max(1, Math.trunc(number)))
    const target = pagesRef.current?.children[targetPage - 1] as HTMLElement | undefined
    focusTarget.current = focusMatch ? { page: targetPage, term: matchTerm } : null
    if (target && viewportRef.current) {
      viewportRef.current.scrollTop = target.offsetTop
      const mark = target.querySelector<HTMLElement>("[data-pdf-highlight]")
      if (focusMatch && mark?.dataset.highlightTerm === matchTerm) {
        viewportRef.current.scrollTop += mark.getBoundingClientRect().top - viewportRef.current.getBoundingClientRect().top
          - Math.min(80, viewportRef.current.clientHeight / 4)
        focusTarget.current = null
      }
    }
    pageOffset.current = target && viewportRef.current ? Math.max(0, (viewportRef.current.scrollTop - target.offsetTop) / target.offsetHeight) : 0
    currentPage.current = targetPage; setPage(targetPage); setPageInput(String(targetPage))
  }
  async function find() {
    if (!pdf) return
    const text = query.trim(); const run = ++searchRun.current
    setTerm(text); setMatches([]); setHighlightStatus("")
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
      setMatches(found); setMatchAt(0); if (found.length) go(found[0], true, text)
      setSearchStatus(`${found.length} matching ${found.length === 1 ? "page" : "pages"}.${unavailable ? " OCR search is unavailable; native PDF text was searched." : !indexedSearch ? " Scanned-page matches require completed OCR indexing." : ""}`)
    } catch { if (run === searchRun.current) setSearchStatus("The document search could not finish. Try again.") }
  }
  const changeZoom = (update: number | ((value: number) => number)) => {
    layoutAnchor.current = { page: currentPage.current, fraction: pageOffset.current }
    setZoom(update)
  }
  const moveMatch = (delta: number) => { const next = (matchAt + delta + matches.length) % matches.length; setMatchAt(next); go(matches[next], true) }
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <TooltipProvider>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2" aria-label="PDF controls">
          <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
            <ToolbarButton label="Previous page" disabled={!pdf || page <= 1} onClick={() => go(page - 1)}><ChevronLeftIcon /></ToolbarButton>
            <form onSubmit={event => { event.preventDefault(); if (pageInput.trim()) go(Number(pageInput)) }}>
              <FieldGroup className="w-16 gap-0"><Field className="gap-0">
                <FieldLabel htmlFor={`${id}-page`} className="sr-only">Page</FieldLabel>
                <Input id={`${id}-page`} inputMode="numeric" pattern="[0-9]*" placeholder="Page" title="Page · Enter to go" className="h-8 text-center" value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={() => { if (pageInput.trim() && Number(pageInput) !== currentPage.current) go(Number(pageInput)) }} />
              </Field></FieldGroup>
            </form>
            <span className="px-1 text-xs tabular-nums text-muted-foreground" aria-label="Total pages">/ {pdf?.numPages ?? "…"}</span>
            <ToolbarButton label="Next page" disabled={!pdf || page >= pdf.numPages} onClick={() => go(page + 1)}><ChevronRightIcon /></ToolbarButton>
          </div>
          <form className="flex min-w-0 flex-wrap items-center gap-1" onSubmit={event => { event.preventDefault(); void find() }}>
            <FieldGroup className="w-44 gap-0 sm:w-52"><Field className="gap-0">
              <FieldLabel htmlFor={`${id}-search`} className="sr-only">Find text</FieldLabel>
              <Input id={`${id}-search`} type="search" placeholder="Search document…" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} className="h-8" />
            </Field></FieldGroup>
            <ToolbarButton label="Find" type="submit" disabled={!pdf}><SearchIcon /></ToolbarButton>
            <ToolbarButton label="Previous match" disabled={!matches.length} onClick={() => moveMatch(-1)}><ArrowUpIcon /></ToolbarButton>
            <ToolbarButton label="Next match" disabled={!matches.length} onClick={() => moveMatch(1)}><ArrowDownIcon /></ToolbarButton>
            {!!matches.length && <span className="px-1 text-xs tabular-nums text-muted-foreground" aria-label="Matching pages">{matchAt + 1}/{matches.length}</span>}
          </form>
          <div className="flex items-center gap-1" role="group" aria-label="Zoom and download">
            <ToolbarButton label="Zoom out" disabled={zoom <= 0.5} onClick={() => changeZoom(value => Math.max(0.5, value - 0.25))}><ZoomOutIcon /></ToolbarButton>
            <ToolbarButton label="Fit width" onClick={() => changeZoom(1)}><ScanLineIcon /></ToolbarButton>
            <ToolbarButton label="Zoom in" disabled={zoom >= 2} onClick={() => changeZoom(value => Math.min(2, value + 0.25))}><ZoomInIcon /></ToolbarButton>
            <ToolbarButton label="Download PDF" nativeButton={false} render={<a href={url} download />}><DownloadIcon /></ToolbarButton>
          </div>
        </div>
      </TooltipProvider>
      <p role="status" className={searchStatus || !pdf ? "text-xs text-muted-foreground" : "sr-only"}>{searchStatus || (!pdf ? "Loading original PDF…" : `Original PDF · page ${page} of ${pdf.numPages}`)}</p>
      {initialHighlight && term === initialHighlight && highlightStatus && <p role="status" className="text-xs text-muted-foreground">{highlightStatus}</p>}
      {error && <Alert variant="destructive"><AlertTitle>PDF unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      <div ref={viewportRef} className="relative h-[calc(88vh-13rem)] min-h-32 overflow-auto [overflow-anchor:none] rounded-md border bg-muted/20 p-3" aria-label="PDF pages" tabIndex={0} onScroll={updateVisiblePage} aria-busy={!pdf}>
        <div ref={pagesRef} className="relative flex w-fit min-w-full flex-col items-center gap-3">
          {pdf && Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={index + 1} pdf={pdf} page={index + 1} width={width * zoom} ratio={pageRatio} term={term} root={viewportRef.current} priority={Math.abs(index + 1 - page) <= 1} onReady={pageReady} />)}
        </div>
      </div>
    </div>
  )
}
