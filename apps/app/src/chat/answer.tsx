import { streamingMarkdownExtension } from "@tanstack/markdown/extensions/streaming"
import { Markdown } from "@tanstack/markdown/react"
import type { MarkdownComponents } from "@tanstack/markdown/react"
import { cn } from "cn"
import { createElement, memo } from "react"
import type { ComponentProps } from "react"

// What a language model writes, drawn. Models structure an answer with markdown, so the chat shows
// it as paragraphs, emphasis, lists, code, links and small tables. Raw HTML stays text, and a link
// that would run a script is not a link: the renderer sees to both.

/** The element with class names of its own. Markdown gives it everything else. */
function styled(tag: string, className: string) {
  return function Styled(props: { className?: string }) {
    return createElement(tag, { ...props, className: cn(className, props.className) })
  }
}

// A heading in an answer is a label over a few lines. It does not join the outline of the page, so
// every level is a paragraph in a heavier weight.
const heading = styled("p", "font-semibold")
const list = "flex flex-col gap-1 pl-5 marker:text-muted-foreground [li>&]:mt-1"
const cell = "border-b py-1.5 pr-3 text-left align-top [tbody>tr:last-child>&]:border-b-0"

const components: MarkdownComponents = {
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  ul: styled("ul", cn(list, "list-disc")),
  ol: styled("ol", cn(list, "list-decimal")),
  blockquote: styled("blockquote", "flex flex-col gap-2.5 pl-4 text-muted-foreground"),
  a: (props: ComponentProps<"a">) => (
    <a {...props} target="_blank" rel="noreferrer" className="underline underline-offset-4" />
  ),
  code: styled("code", "rounded-sm bg-muted px-1 py-0.5 font-mono text-xs"),
  pre: styled("pre", "overflow-x-auto rounded-md bg-muted p-3 [&>code]:bg-transparent [&>code]:p-0"),
  // A table is as wide as its values, and the chat is narrow: it scrolls on its own.
  table: (props: ComponentProps<"table">) => (
    <div className="overflow-x-auto">
      <table {...props} className="w-full border-collapse" />
    </div>
  ),
  th: styled("th", cn(cell, "font-medium")),
  td: styled("td", cell),
}

// While an answer arrives, its last block can be half written.
const extensions = [streamingMarkdownExtension()]

/**
 * An answer loads nothing from elsewhere. A picture would tell its server that somebody read the
 * answer, and its address can carry what the answer was about. Its description is shown instead.
 */
function urlOf(_url: string, kind: "link" | "image", checked: string): string | null {
  return kind === "image" ? null : checked
}

export const Answer = memo(function Answer({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <Markdown
        extensions={extensions}
        components={components}
        urlTransform={urlOf}
        frontmatter={false}
        headingIds={false}
      >
        {text}
      </Markdown>
    </div>
  )
})
