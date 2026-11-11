import { MessageSquareIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"

import { useChatPanel } from "@/chat/ask.ts"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"

/** The field in the header. A question opens a chat in the panel on the right; the page stays as it is. */
export function AskAnything() {
  const panel = useChatPanel()
  const field = useRef<HTMLInputElement>(null)
  const [text, setText] = useState("")

  // Ctrl K puts the cursor in the field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        field.current?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const question = text.trim()
    if (question === "") return
    setText("")
    panel.ask(question)
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md min-w-0 flex-1">
      <InputGroup>
        <InputGroupAddon>
          <MessageSquareIcon />
        </InputGroupAddon>
        <InputGroupInput
          ref={field}
          aria-label="Ask a question"
          placeholder="Ask a question"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <InputGroupAddon align="inline-end" className="max-sm:hidden">
          <Kbd>Ctrl K</Kbd>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
