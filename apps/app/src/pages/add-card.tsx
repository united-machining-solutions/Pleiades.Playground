import { CircleAlertIcon, InfoIcon, PlusIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import type { FormEvent } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { RETRY_MS } from "@/hooks/use-live.ts"
import type { Answer } from "@/machines/get-machines.ts"
import type { Choice } from "@/machines/switcher.ts"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Button } from "@pleiades/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pleiades/ui/components/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@pleiades/ui/components/field"
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@pleiades/ui/components/number-field"
import { RadioGroup, RadioGroupItem } from "@pleiades/ui/components/radio-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@pleiades/ui/components/select"
import { Skeleton } from "@pleiades/ui/components/skeleton"

import { hintOf, labelOf, partOf, whyOff } from "./add-part.ts"
import type { CardArgument, CardChoice, Filled } from "./add-part.ts"
import { getCardChoices } from "./card-choices.ts"
import type { CardChoices } from "./card-choices.ts"
import { MAX_PARTS } from "./recipe.ts"
import type { RecipePart } from "./recipe.ts"

// What a kept page shows at its end while it is edited: "Add a card", which opens a dialog. The person
// chooses a card by what it shows, then what it takes, a machine by its name and the hours of its
// history, and the card goes to the end of the page. No language model: the choice is the person's,
// the cards are the ones a page can hold, and what each takes is read from the backend when the
// dialog opens. A full page shows why instead of the button.

/**
 * The control at the end of a page that is edited. `onAdd` keeps the part and returns null, or the
 * sentence why it was not added. After a card is added, the focus goes to `added()`, a control of the
 * new part; the button may be gone by then, when the page is full.
 */
export function AddCard({
  parts,
  onAdd,
  added,
}: {
  parts: ReadonlyArray<RecipePart>
  onAdd: (part: RecipePart) => string | null
  added: () => HTMLElement | null
}) {
  const [open, setOpen] = useState(false)
  // Whether the dialog closes because a card was added: the focus then goes to the new part.
  const done = useRef(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) done.current = false
        setOpen(next)
      }}
    >
      {parts.length >= MAX_PARTS ? (
        // The dialog stays, so that it can close and hand on the focus when the last card made the page full.
        <Alert>
          <InfoIcon />
          <AlertTitle>A page holds at most {MAX_PARTS} parts.</AlertTitle>
          <AlertDescription>Remove one to add another.</AlertDescription>
        </Alert>
      ) : (
        // As wide as the cards: the new one comes here.
        <DialogTrigger render={<Button variant="outline" className="w-full" />}>
          <PlusIcon data-icon="inline-start" />
          Add a card
        </DialogTrigger>
      )}
      <DialogContent finalFocus={() => (done.current ? (added() ?? true) : true)}>
        <DialogHeader>
          <DialogTitle>Add a card</DialogTitle>
          <DialogDescription>It goes to the end of the page and shows the values of now.</DialogDescription>
        </DialogHeader>
        {/* Mounted while the dialog is open: every opening asks the backend anew and starts empty. */}
        <CardForm
          onAdd={(part) => {
            const why = onAdd(part)
            if (why === null) {
              done.current = true
              setOpen(false)
            }
            return why
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

/** What the backend offers, asked when the dialog opens and again while it does not answer. */
function useCardChoices(): Answer<CardChoices> | undefined {
  const [answer, setAnswer] = useState<Answer<CardChoices>>()
  const [asked, setAsked] = useState(0)
  useEffect(() => {
    let current = true
    getCardChoices()
      .catch((error: unknown): Answer<CardChoices> => ({ values: null, error: String(error) }))
      .then((got) => {
        if (current) setAnswer(got)
      })
    return () => {
      current = false
    }
  }, [asked])
  useEffect(() => {
    if (answer?.values !== null) return
    const timer = setTimeout(() => setAsked((times) => times + 1), RETRY_MS)
    return () => clearTimeout(timer)
  }, [answer])
  return answer
}

/** The body of the dialog: the cards to choose from, what the chosen one takes, and the buttons. */
function CardForm({ onAdd }: { onAdd: (part: RecipePart) => string | null }) {
  const answer = useCardChoices()
  const form = useId()
  const [tool, setTool] = useState<string | null>(null)
  const [filled, setFilled] = useState<Filled>({})
  // Why the form has nothing to add yet: no card chosen, or an argument by its name.
  const [noCard, setNoCard] = useState(false)
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [notAdded, setNotAdded] = useState<string | null>(null)
  const choices = answer?.values ?? null
  const chosen = choices?.cards.find((card) => card.tool === tool)

  function fill(name: string, value: string | number | null) {
    setFilled((before) => ({ ...before, [name]: value }))
    setProblems(({ [name]: _solved, ...left }) => left)
    setNotAdded(null)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chosen) {
      setNoCard(true)
      return
    }
    const made = partOf(chosen, filled)
    if (made.part === null) setProblems(made.problems)
    else setNotAdded(onAdd(made.part))
  }

  return (
    <>
      {answer === undefined ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : choices === null ? (
        <NoAnswer error={`${answer.error} Nothing can be added until it answers.`} />
      ) : (
        <form id={form} onSubmit={submit} noValidate>
          <FieldGroup>
            <FieldSet data-invalid={noCard || undefined}>
              <FieldLegend className="sr-only">Card</FieldLegend>
              <RadioGroup
                value={tool}
                onValueChange={(value) => {
                  setTool(typeof value === "string" ? value : null)
                  setNoCard(false)
                  setProblems({})
                  setNotAdded(null)
                }}
              >
                {choices.cards.map((card) => (
                  <CardOption key={card.tool} card={card} off={whyOff(card, choices.machines.error)} invalid={noCard} />
                ))}
              </RadioGroup>
              {noCard && <FieldError>Choose a card.</FieldError>}
            </FieldSet>
            {chosen?.asks.map((argument) => (
              <ArgumentField
                key={argument.name}
                argument={argument}
                machines={choices.machines}
                value={filled[argument.name] ?? null}
                problem={problems[argument.name]}
                onChange={(value) => fill(argument.name, value)}
              />
            ))}
          </FieldGroup>
        </form>
      )}
      {notAdded !== null && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Nothing was added</AlertTitle>
          <AlertDescription>{notAdded}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" form={form} disabled={choices === null}>
          Add
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * One card to choose, as a card of its own: the label wraps the field. One that cannot be added here
 * is off, and says why (`off`).
 */
function CardOption({ card, off, invalid }: { card: CardChoice; off: string | null; invalid: boolean }) {
  const id = useId()
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal" data-disabled={off !== null || undefined} data-invalid={invalid || undefined}>
        <FieldContent>
          <FieldTitle>{card.shows}</FieldTitle>
          {off !== null && <FieldDescription>{off}</FieldDescription>}
        </FieldContent>
        <RadioGroupItem value={card.tool} id={id} disabled={off !== null} aria-invalid={invalid || undefined} />
      </Field>
    </FieldLabel>
  )
}

/** The field of one argument: a machine chosen by its name, or a whole number in its range. */
function ArgumentField({
  argument,
  machines,
  value,
  problem,
  onChange,
}: {
  argument: CardArgument
  machines: Answer<Array<Choice>>
  value: string | number | null
  problem: string | undefined
  onChange: (value: string | number | null) => void
}) {
  const id = useId()
  const invalid = problem !== undefined || undefined
  if (argument.kind === "machine") {
    // Optional: nothing chosen is every machine, and says so. Required: nothing chosen is a placeholder.
    const items = [
      ...(argument.required ? [] : [{ label: "Every machine", value: null }]),
      ...(machines.values ?? []).map((machine) => ({ label: machine.title, value: machine.machine })),
    ]
    return (
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={id}>{labelOf(argument)}</FieldLabel>
        <Select
          items={items}
          value={typeof value === "string" ? value : null}
          onValueChange={(chosen) => onChange(typeof chosen === "string" ? chosen : null)}
        >
          <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
            <SelectValue placeholder="Choose a machine" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value ?? ""} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {machines.values === null ? (
          <FieldDescription>The machines cannot be read now. {machines.error}</FieldDescription>
        ) : (
          machines.values.length === 0 && <FieldDescription>No machine has sent a value in the last 24 hours.</FieldDescription>
        )}
        {problem && <FieldError>{problem}</FieldError>}
      </Field>
    )
  }
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{labelOf(argument)}</FieldLabel>
      <NumberField
        id={id}
        value={typeof value === "number" ? value : null}
        onValueChange={(number) => onChange(number)}
        min={argument.min}
        max={argument.max}
        step={1}
        format={{ maximumFractionDigits: 0 }}
        required={argument.required}
      >
        <NumberFieldGroup>
          <NumberFieldDecrement />
          <NumberFieldInput aria-invalid={invalid} />
          <NumberFieldIncrement />
        </NumberFieldGroup>
      </NumberField>
      <FieldDescription>{hintOf(argument)}</FieldDescription>
      {problem && <FieldError>{problem}</FieldError>}
    </Field>
  )
}
