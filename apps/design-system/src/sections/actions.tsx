import type { State } from "@pleiades/cards/machine/contract.ts"
import { stateLabel, stateOrder } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Badge } from "@pleiades/ui/components/badge"
import { Button, buttonVariants } from "@pleiades/ui/components/button"
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@pleiades/ui/components/button-group"
import { Input } from "@pleiades/ui/components/input"
import { Kbd, KbdGroup } from "@pleiades/ui/components/kbd"
import { Label } from "@pleiades/ui/components/label"
import { Spinner } from "@pleiades/ui/components/spinner"
import { Toggle } from "@pleiades/ui/components/toggle"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import {
  ArrowDownIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageCircleQuestionIcon,
  MinusIcon,
  PanelRightIcon,
  PlusIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Block, Example, Examples, Section } from "@/block.tsx"
import { StateMatrix, previewState } from "@/state-matrix.tsx"

const buttonVariantNames = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const

/** What a button of each variant says in this app. */
const buttonLabel: Record<(typeof buttonVariantNames)[number], string> = {
  default: "New chat",
  outline: "Ask why",
  secondary: "All machines",
  ghost: "Close",
  destructive: "Delete chat",
  link: "Open P-04",
}

const buttonSizes = ["xs", "sm", "default", "lg"] as const
const iconButtonSizes = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const

const toggleVariants = ["default", "outline"] as const
const badgeVariants = ["default", "secondary", "outline", "destructive", "ghost", "link"] as const

export function Actions() {
  return (
    <Section id="actions" line="What a person presses: a button, a group of them, a toggle, and the small signs that stand next to them.">
      <Block
        name="Button"
        file="button"
        line="Starts an action. One primary button in a group; what stands next to it is an outline or a ghost button."
      >
        <Example title="Typical: the primary action and the one next to it">
          <Button>
            <PlusIcon data-icon="inline-start" />
            New chat
          </Button>
          <Button variant="outline">Ask why</Button>
        </Example>
        <Example title="Variants and their states. The last column is loading: a spinner, and the button is disabled.">
          <StateMatrix
            rows={buttonVariantNames}
            states={["default", "hover", "focus", "active", "disabled", "loading"]}
            render={(variant, state) =>
              state === "loading" ? (
                <Button variant={variant} disabled>
                  <Spinner data-icon="inline-start" />
                  {buttonLabel[variant]}
                </Button>
              ) : (
                <Button variant={variant} {...previewState(state)}>
                  {buttonLabel[variant]}
                </Button>
              )
            }
          />
        </Example>
        <Examples>
          <Example title="Sizes: xs, sm, default, lg">
            {buttonSizes.map((size) => (
              <Button key={size} variant="outline" size={size}>
                Ask why
              </Button>
            ))}
          </Example>
          <Example title="Icon only, in the same four sizes. It needs a label for screen readers.">
            {iconButtonSizes.map((size) => (
              <Button key={size} variant="outline" size={size} aria-label="Open the chat">
                <PanelRightIcon />
              </Button>
            ))}
          </Example>
          <Example title="With an icon, before or after the label">
            <Button variant="outline">
              <MessageCircleQuestionIcon data-icon="inline-start" />
              Ask why
            </Button>
            <Button variant="outline">
              Open P-04
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </Example>
          <Example title="A link that looks like a button stays a link: buttonVariants on the link">
            <a href="#built-from-these" className={buttonVariants({ variant: "outline" })}>
              The machine card
            </a>
          </Example>
        </Examples>
        <Example title="A long label stays on one line and does not shrink, so keep it to a few words" className="overflow-x-auto">
          <Button variant="outline">Ask why P-04 has been in alarm with a spindle overtemperature since 09:02</Button>
        </Example>
      </Block>

      <Block
        name="Button group"
        file="button-group"
        line="Buttons that belong together, joined into one. For actions; a choice among options is a toggle group."
      >
        <Examples>
          <Example title="Typical: two steps of the same action">
            <ButtonGroup aria-label="Hours of the history">
              <Button variant="outline">
                <ChevronLeftIcon data-icon="inline-start" />
                Earlier
              </Button>
              <Button variant="outline">
                Later
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            </ButtonGroup>
          </Example>
          <Example title="Split, with a separator: buttons without an outline need one">
            <ButtonGroup>
              <Button variant="secondary">Ask why</Button>
              <ButtonGroupSeparator />
              <Button variant="secondary" size="icon" aria-label="More questions">
                <ChevronDownIcon />
              </Button>
            </ButtonGroup>
          </Example>
          <Example title="With text and an input">
            <ButtonGroup>
              <ButtonGroupText render={<Label htmlFor="button-group-machine" />}>Machine</ButtonGroupText>
              <Input id="button-group-machine" placeholder="P-04" className="w-28" />
              <Button variant="outline">Open</Button>
            </ButtonGroup>
          </Example>
          <Example title="Vertical">
            <ButtonGroup orientation="vertical" aria-label="Hours of the history">
              <Button variant="outline" size="icon" aria-label="More hours">
                <PlusIcon />
              </Button>
              <Button variant="outline" size="icon" aria-label="Fewer hours">
                <MinusIcon />
              </Button>
            </ButtonGroup>
          </Example>
        </Examples>
      </Block>

      <Block name="Toggle" file="toggle" line="One thing that is on or off, and shows which.">
        <Example title="Typical">
          <Toggle aria-label="Show only machines with a warning" defaultPressed>
            <TriangleAlertIcon />
            Warnings only
          </Toggle>
        </Example>
        <Example title="Variants and their states. The last column is pressed.">
          <StateMatrix
            rows={toggleVariants}
            states={["default", "hover", "focus", "disabled", "pressed"]}
            render={(variant, state) => (
              <Toggle
                variant={variant}
                aria-label="Show only machines with a warning"
                defaultPressed={state === "pressed"}
                {...previewState(state)}
              >
                <TriangleAlertIcon />
                Warnings only
              </Toggle>
            )}
          />
        </Example>
        <Example title="Sizes: sm, default, lg">
          {(["sm", "default", "lg"] as const).map((size) => (
            <Toggle key={size} variant="outline" size={size} aria-label="Show only machines with a warning">
              <TriangleAlertIcon />
              Warnings only
            </Toggle>
          ))}
        </Example>
      </Block>

      <Block
        name="Toggle group"
        file="toggle-group"
        line="A choice among two to seven options that all stay in view. One of them, or several."
      >
        <Examples>
          <Example title="Typical: one of a few">
            <ToggleGroup variant="outline" defaultValue={["8"]} aria-label="Hours of the history">
              <ToggleGroupItem value="1">1 h</ToggleGroupItem>
              <ToggleGroupItem value="8">8 h</ToggleGroupItem>
              <ToggleGroupItem value="24">24 h</ToggleGroupItem>
            </ToggleGroup>
          </Example>
          <Example title="Joined: spacing 0">
            <ToggleGroup variant="outline" spacing={0} defaultValue={["8"]} aria-label="Hours of the history">
              <ToggleGroupItem value="1">1 h</ToggleGroupItem>
              <ToggleGroupItem value="8">8 h</ToggleGroupItem>
              <ToggleGroupItem value="24">24 h</ToggleGroupItem>
            </ToggleGroup>
          </Example>
          <Example title="Without an outline, and disabled">
            <ToggleGroup defaultValue={["8"]} aria-label="Hours of the history">
              <ToggleGroupItem value="1">1 h</ToggleGroupItem>
              <ToggleGroupItem value="8">8 h</ToggleGroupItem>
              <ToggleGroupItem value="24">24 h</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup variant="outline" disabled defaultValue={["8"]} aria-label="Hours of the history">
              <ToggleGroupItem value="1">1 h</ToggleGroupItem>
              <ToggleGroupItem value="8">8 h</ToggleGroupItem>
              <ToggleGroupItem value="24">24 h</ToggleGroupItem>
            </ToggleGroup>
          </Example>
          <Example title="Vertical">
            <ToggleGroup variant="outline" orientation="vertical" spacing={0} defaultValue={["8"]} aria-label="Hours of the history">
              <ToggleGroupItem value="1">1 h</ToggleGroupItem>
              <ToggleGroupItem value="8">8 h</ToggleGroupItem>
              <ToggleGroupItem value="24">24 h</ToggleGroupItem>
            </ToggleGroup>
          </Example>
        </Examples>
        <Example title="Several at once" className="overflow-x-auto">
          <ToggleGroup variant="outline" multiple defaultValue={["alarm", "stopped"]} aria-label="States to show">
            {stateOrder.map((state: State) => (
              <ToggleGroupItem key={state} value={state}>
                <StateSymbol state={state} />
                {stateLabel[state]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Example>
      </Block>

      <Block
        name="Badge"
        file="badge"
        line="A short word about a thing: its state, a count, a kind. It labels, it is not pressed."
      >
        <Example title="Typical: the state of a machine is a symbol and a word in an outline badge">
          {stateOrder.map((state: State) => (
            <Badge key={state} variant="outline">
              <StateSymbol state={state} />
              {stateLabel[state]}
            </Badge>
          ))}
        </Example>
        <Examples>
          <Example title="Variants: default, secondary, outline, destructive, ghost, link">
            {badgeVariants.map((variant) => (
              <Badge key={variant} variant={variant}>
                {variant === "destructive" ? "Error 2130" : variant === "secondary" ? "3" : "Setup"}
              </Badge>
            ))}
          </Example>
          <Example title="With an icon, with a spinner, as a link">
            <Badge variant="secondary">
              <TriangleAlertIcon data-icon="inline-start" />
              Warning 3310
            </Badge>
            <Badge variant="secondary">
              <Spinner data-icon="inline-start" />
              Reading
            </Badge>
            <Badge variant="outline" render={<a href="#built-from-these" />}>
              The machine card
              <ArrowDownIcon data-icon="inline-end" />
            </Badge>
          </Example>
        </Examples>
        <Example title="A long text stays on one line: a badge is a word, the sentence belongs next to it" className="overflow-x-auto">
          <Badge variant="outline">
            <StateSymbol state="alarm" />
            Spindle overtemperature, machine stopped, program SHAFT_4711.MPF interrupted
          </Badge>
        </Example>
      </Block>

      <Block name="Kbd" file="kbd" line="A key, or the keys of a shortcut, as a person finds them on the keyboard.">
        <Examples>
          <Example title="A key, and a group of keys">
            <Kbd>Esc</Kbd>
            <KbdGroup>
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
            <p className="text-sm text-muted-foreground">
              Press{" "}
              <KbdGroup>
                <Kbd>Ctrl</Kbd>
                <Kbd>B</Kbd>
              </KbdGroup>{" "}
              to fold the sidebar.
            </p>
          </Example>
          <Example title="In a button">
            <Button variant="outline">
              Ask a question
              <Kbd data-icon="inline-end" className="translate-x-0.5">
                Ctrl K
              </Kbd>
            </Button>
          </Example>
        </Examples>
      </Block>
    </Section>
  )
}
