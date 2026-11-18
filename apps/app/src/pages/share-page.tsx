import { CheckIcon, CopyIcon, ShareIcon } from "lucide-react"
import { useId, useRef, useState } from "react"
import type { RefObject } from "react"

import { Button } from "@pleiades/ui/components/button"
import { Field, FieldDescription, FieldLabel } from "@pleiades/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@pleiades/ui/components/input-group"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@pleiades/ui/components/popover"

import { MAX_PARAM_LENGTH, linkOf } from "./link.ts"
import type { Recipe } from "./recipe.ts"

/**
 * "Share" in the head of a page kept in this browser: a popover with the link to the recipe of the
 * page, in a field that cannot be edited, and "Copy link". A page is private until it is shared, and
 * the stack keeps no page, so the link carries the recipe (`link.ts`); what it carries is said in
 * words. The link is made when the popover opens, from the recipe as it is then (a page renamed
 * since is shared under its new title), with the origin this browser has.
 */
export function SharePage({ recipe }: { recipe: Recipe }) {
  // The press of "Copy link" is the first thing to reach, not the field: a link that is selected shows its tail.
  const copyLink = useRef<HTMLButtonElement>(null)
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        <ShareIcon data-icon="inline-start" />
        Share
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" initialFocus={copyLink}>
        <ShareLink recipe={recipe} copyLink={copyLink} />
      </PopoverContent>
    </Popover>
  )
}

/** What the press of "Copy link" came to. Said in words under the field, and never only by the icon. */
type Copied = "not yet" | "copied" | "refused"

function ShareLink({ recipe, copyLink }: { recipe: Recipe; copyLink: RefObject<HTMLButtonElement | null> }) {
  // The app renders in the browser, so this is the origin the person is on.
  const link = linkOf(recipe, window.location.origin)
  const field = useId()
  const input = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState<Copied>("not yet")

  if (link === null) {
    return (
      <PopoverHeader>
        <PopoverTitle>Share this page</PopoverTitle>
        <PopoverDescription>
          This page is too large for a link: the link would be longer than {MAX_PARAM_LENGTH.toLocaleString("en")} characters.
        </PopoverDescription>
      </PopoverHeader>
    )
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied("copied")
    } catch {
      // The browser has no clipboard here (a page that is not https or localhost), or the person
      // said no. The link is selected, so that it can be copied by hand.
      setCopied("refused")
      input.current?.select()
    }
  }

  return (
    <>
      <PopoverHeader>
        <PopoverTitle>Share this page</PopoverTitle>
        <PopoverDescription>
          The link carries the recipe: which answers, for which machines and hours. It carries no values. Whoever opens it sees
          fresh values, and can keep the page.
        </PopoverDescription>
      </PopoverHeader>
      <Field>
        <FieldLabel htmlFor={field} className="sr-only">
          Link to this page
        </FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={field}
            ref={input}
            readOnly
            value={link}
            autoComplete="off"
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton ref={copyLink} variant="secondary" onClick={() => void copy(link)}>
              {copied === "copied" ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
              Copy link
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {/* Always there, so that a screen reader says what the press came to; it takes no room until it has words. */}
        <FieldDescription role="status" className={copied === "not yet" ? "sr-only" : undefined}>
          {copied === "copied" && "Link copied."}
          {copied === "refused" && "The browser did not allow copying. The link is selected: copy it by hand."}
        </FieldDescription>
      </Field>
    </>
  )
}
