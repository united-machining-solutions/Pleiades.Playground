import { Checkbox } from "@pleiades/ui/components/checkbox"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxValue,
  useComboboxAnchor,
} from "@pleiades/ui/components/combobox"
import { DirectionProvider } from "@pleiades/ui/components/direction"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
} from "@pleiades/ui/components/field"
import { Input } from "@pleiades/ui/components/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "@pleiades/ui/components/input-group"
import { Kbd } from "@pleiades/ui/components/kbd"
import { Label } from "@pleiades/ui/components/label"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@pleiades/ui/components/native-select"
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@pleiades/ui/components/number-field"
import { OTPField, OTPFieldGroup, OTPFieldInput, OTPFieldSeparator } from "@pleiades/ui/components/otp-field"
import { RadioGroup, RadioGroupItem } from "@pleiades/ui/components/radio-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@pleiades/ui/components/select"
import { Slider } from "@pleiades/ui/components/slider"
import { Switch } from "@pleiades/ui/components/switch"
import { Textarea } from "@pleiades/ui/components/textarea"
import { ArrowUpIcon, SearchIcon, XIcon } from "lucide-react"
import { Fragment, useState } from "react"

import { Block, Example, Examples, Section } from "@/block.tsx"
import { StateMatrix, previewState } from "@/state-matrix.tsx"

// The words of the examples are those of the demo: its machines, the topics its machines publish
// to, and the rule of the contract for a serial number.

const machines = [
  { label: "Select a machine", value: null },
  { label: "P-04", value: "P-04" },
  { label: "P-07", value: "P-07" },
  { label: "M-02", value: "M-02" },
]

const hours = [
  { label: "Last hour", value: "1" },
  { label: "Last 8 hours", value: "8" },
  { label: "Last 24 hours", value: "24" },
]

const topics = [
  "umati/Connection/State",
  "umati/Production/ActiveProgram",
  "umati/Spindle/1/Override",
  "umati/State/FeedOverride",
  "umati/State/MachineryItemState",
  "umati/State/MachineryOperationMode",
  "vendor/Spindle/1/BearingTemperature",
]

const topicGroups = [
  { value: "Named by the data model", items: topics.filter((topic) => topic.startsWith("umati/")) },
  { value: "Of the manufacturer", items: topics.filter((topic) => topic.startsWith("vendor/")) },
]

const fieldStates = ["default", "hover", "focus", "disabled", "invalid"] as const

/** The six slots of a code, in two groups of three. `slot` adds what a state needs to a slot. */
function CodeSlots({
  slot,
}: {
  slot?: (index: number) => { "aria-invalid"?: boolean; "data-preview"?: string } | undefined
}) {
  return (
    <>
      {[0, 3].map((first) => (
        <Fragment key={first}>
          {first > 0 && <OTPFieldSeparator />}
          <OTPFieldGroup>
            {[first, first + 1, first + 2].map((index) => (
              // The first slot takes the label of the field; the others say which one they are.
              <OTPFieldInput
                key={index}
                aria-label={index === 0 ? undefined : `Character ${index + 1} of 6`}
                {...slot?.(index)}
              />
            ))}
          </OTPFieldGroup>
        </Fragment>
      ))}
    </>
  )
}

function TopicsWithChips() {
  const anchor = useComboboxAnchor()
  return (
    <Combobox multiple autoHighlight items={topics} defaultValue={[topics[2], topics[6]]}>
      <ComboboxChips ref={anchor} className="w-full">
        <ComboboxValue>
          {(values: Array<string>) => (
            <>
              {values.map((value) => (
                <ComboboxChip key={value}>{value}</ComboboxChip>
              ))}
              <ComboboxChipsInput aria-label="Topics to show" />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No topic of that name.</ComboboxEmpty>
        <ComboboxList>
          {(topic: string) => (
            <ComboboxItem key={topic} value={topic}>
              {topic}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function WarnAbove() {
  const [limit, setLimit] = useState([55])
  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor="slider-limit">Warn above</FieldLabel>
        <span className="text-sm text-muted-foreground tabular-nums">{limit[0]} °C</span>
      </div>
      <Slider
        id="slider-limit"
        value={limit}
        onValueChange={(value) => setLimit(value as Array<number>)}
        min={20}
        max={80}
        step={1}
      />
      <FieldDescription>The bearing temperature of spindle 1, between 20 and 80 °C.</FieldDescription>
    </Field>
  )
}

export function Inputs() {
  return (
    <Section
      id="inputs"
      line="What a person fills in. A control stands in a Field, which gives it its label, its description and its error."
    >
      <Block
        name="Field"
        file="field"
        line="The frame of a control in a form: label, control, description, error. A form is a FieldGroup of them; a form library, if you need one, hands its errors to FieldError."
      >
        <Example title="Typical, with an error, disabled, required" className="items-start">
          <FieldGroup className="grid gap-6 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="field-serial">Serial number</FieldLabel>
              <Input id="field-serial" placeholder="P-04" />
              <FieldDescription>The level after machines/ in every topic.</FieldDescription>
            </Field>
            <Field data-invalid>
              <FieldLabel htmlFor="field-serial-invalid">Serial number</FieldLabel>
              <Input id="field-serial-invalid" defaultValue="P/04" aria-invalid />
              <FieldError>A serial number contains no /, + or #.</FieldError>
            </Field>
            <Field data-disabled>
              <FieldLabel htmlFor="field-serial-disabled">Serial number</FieldLabel>
              <Input id="field-serial-disabled" defaultValue="P-04" disabled />
              <FieldDescription>Taken from the topic, not to be changed here.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="field-serial-required">
                Serial number <span className="text-destructive">*</span>
              </FieldLabel>
              <Input id="field-serial-required" placeholder="P-04" required />
              <FieldDescription>It identifies the machine in every topic.</FieldDescription>
            </Field>
          </FieldGroup>
        </Example>
        <Examples>
          <Example title="A set of fields with a legend, and a separator between sets" className="items-start">
            <FieldGroup>
              <FieldSet>
                <FieldLegend>A value</FieldLegend>
                <FieldDescription>Which machine it belongs to, and where it comes from.</FieldDescription>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="field-machine">Serial number</FieldLabel>
                    <Input id="field-machine" defaultValue="P-04" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="field-topic">Topic</FieldLabel>
                    <Input id="field-topic" defaultValue="vendor/Spindle/1/BearingTemperature" />
                  </Field>
                </FieldGroup>
              </FieldSet>
              <FieldSeparator />
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="field-live">Live</FieldLabel>
                  <FieldDescription>Read the values again every ten seconds.</FieldDescription>
                </FieldContent>
                <Switch id="field-live" defaultChecked />
              </Field>
            </FieldGroup>
          </Example>
          <Example title="A choice as cards: the label wraps the field" className="items-start">
            <FieldSet className="w-full">
              <FieldLegend variant="label">History of a machine</FieldLegend>
              <RadioGroup defaultValue="8">
                <FieldLabel htmlFor="field-hours-8">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>Last 8 hours</FieldTitle>
                      <FieldDescription>A shift. What the machine card shows.</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value="8" id="field-hours-8" />
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="field-hours-24">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>Last 24 hours</FieldTitle>
                      <FieldDescription>The most a history covers.</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value="24" id="field-hours-24" />
                  </Field>
                </FieldLabel>
              </RadioGroup>
            </FieldSet>
          </Example>
        </Examples>
      </Block>

      <Block name="Label" file="label" line="Names a control that stands outside a Field. In a Field, take FieldLabel, which is this label.">
        <Example title="Typical">
          <Checkbox id="label-warnings" defaultChecked />
          <Label htmlFor="label-warnings">Show warnings on running machines</Label>
        </Example>
      </Block>

      <Block name="Input" file="input" line="One line of text.">
        <Example title="States. An input has no look of its own under the pointer.">
          <StateMatrix
            rows={["input"] as const}
            states={fieldStates}
            render={(_, state) => (
              <Input
                aria-label="Serial number"
                className="w-36"
                defaultValue={state === "invalid" ? "P/04" : "P-04"}
                aria-invalid={state === "invalid" || undefined}
                {...previewState(state)}
              />
            )}
          />
        </Example>
        <Examples>
          <Example title="Empty, with a placeholder">
            <Input aria-label="Program" placeholder="SHAFT_4711.MPF" />
          </Example>
          <Example title="A file">
            <Input aria-label="Program file" type="file" />
          </Example>
        </Examples>
      </Block>

      <Block
        name="Input group"
        file="input-group"
        line="An input with something inside its frame: an icon, a unit, a key, a button. Also the frame of a prompt."
      >
        <Examples>
          <Example title="With an icon and a key" className="items-start">
            <InputGroup>
              <InputGroupInput aria-label="Search a machine" placeholder="Search a machine" />
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupAddon align="inline-end">
                <Kbd>Ctrl K</Kbd>
              </InputGroupAddon>
            </InputGroup>
          </Example>
          <Example title="With a unit, and with a button">
            <InputGroup>
              <InputGroupInput aria-label="Warn above" defaultValue="55" inputMode="decimal" />
              <InputGroupAddon align="inline-end">
                <InputGroupText>°C</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            <InputGroup>
              <InputGroupInput aria-label="Program" defaultValue="SHAFT_4711.MPF" />
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Clear">
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Example>
          <Example title="Disabled, and invalid">
            <InputGroup data-disabled="true">
              <InputGroupInput aria-label="Search a machine" placeholder="Search a machine" disabled />
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
            </InputGroup>
            <InputGroup>
              <InputGroupInput aria-label="Warn above" defaultValue="550" aria-invalid />
              <InputGroupAddon align="inline-end">
                <InputGroupText>°C</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Example>
          <Example title="A prompt: a textarea with its buttons below" className="items-start">
            <InputGroup>
              <InputGroupTextarea aria-label="Question" placeholder="Ask about a machine" />
              <InputGroupAddon align="block-end">
                <InputGroupButton variant="default" size="icon-xs" className="ml-auto" aria-label="Send">
                  <ArrowUpIcon />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Example>
        </Examples>
      </Block>

      <Block name="Textarea" file="textarea" line="Several lines of text. It grows with what is written.">
        <Example title="States">
          <StateMatrix
            rows={["textarea"] as const}
            states={fieldStates}
            render={(_, state) => (
              <Textarea
                aria-label="Note for the next shift"
                className="w-36"
                defaultValue="Coolant refilled at 09:10."
                aria-invalid={state === "invalid" || undefined}
                {...previewState(state)}
              />
            )}
          />
        </Example>
        <Example title="In a field" className="items-start">
          <Field>
            <FieldLabel htmlFor="textarea-note">Note for the next shift</FieldLabel>
            <Textarea id="textarea-note" placeholder="What the next shift should know about P-04" />
            <FieldDescription>A few sentences are enough.</FieldDescription>
          </Field>
        </Example>
      </Block>

      <Block
        name="Select"
        file="select"
        line="One of a list that is known beforehand. Up to about seven options that should stay in view are a toggle group or a radio group."
      >
        <Example title="States. A select has no look of its own under the pointer.">
          <StateMatrix
            rows={["select"] as const}
            states={fieldStates}
            render={(_, state) => (
              <Select items={machines} defaultValue="P-04" disabled={state === "disabled"}>
                <SelectTrigger
                  aria-label="Machine"
                  className="w-36"
                  aria-invalid={state === "invalid" || undefined}
                  {...(state === "disabled" ? {} : previewState(state))}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {machines.map((machine) => (
                      <SelectItem key={machine.label} value={machine.value}>
                        {machine.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          />
        </Example>
        <Examples>
          <Example title="Typical: nothing chosen yet, in a field" className="items-start">
            <Field>
              <FieldLabel htmlFor="select-machine">Machine</FieldLabel>
              <Select items={machines}>
                <SelectTrigger id="select-machine" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {machines.map((machine) => (
                      <SelectItem key={machine.label} value={machine.value}>
                        {machine.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </Example>
          <Example title="Groups with a label and a separator, and the small size">
            <Select items={topics.map((topic) => ({ label: topic, value: topic }))} defaultValue={topics[6]}>
              <SelectTrigger aria-label="Topic" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {topicGroups.map((group, index) => (
                  <Fragment key={group.value}>
                    {index > 0 && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel>{group.value}</SelectLabel>
                      {group.items.map((topic) => (
                        <SelectItem key={topic} value={topic}>
                          {topic}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </Fragment>
                ))}
              </SelectContent>
            </Select>
          </Example>
        </Examples>
      </Block>

      <Block
        name="Native select"
        file="native-select"
        line="The select of the browser, in the look of the others. Take it where the list of the system serves better: on a phone, in a long form."
      >
        <Example title="States">
          <StateMatrix
            rows={["native select"] as const}
            states={fieldStates}
            render={(_, state) => (
              <NativeSelect
                aria-label="History"
                className="w-36 shrink-0"
                defaultValue="8"
                aria-invalid={state === "invalid" || undefined}
                {...previewState(state)}
              >
                {hours.map((hour) => (
                  <NativeSelectOption key={hour.value} value={hour.value}>
                    {hour.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          />
        </Example>
        <Example title="With groups, and the small size">
          <NativeSelect aria-label="Topic" defaultValue={topics[6]}>
            {topicGroups.map((group) => (
              <NativeSelectOptGroup key={group.value} label={group.value}>
                {group.items.map((topic) => (
                  <NativeSelectOption key={topic} value={topic}>
                    {topic}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="History" size="sm" defaultValue="8">
            {hours.map((hour) => (
              <NativeSelectOption key={hour.value} value={hour.value}>
                {hour.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Example>
      </Block>

      <Block
        name="Combobox"
        file="combobox"
        line="A list to search in: type, and the list narrows. It is also what this repository takes where shadcn would take a command palette."
      >
        <Examples>
          <Example title="Typical: one of many, with a way to clear it" className="items-start">
            <Field>
              <FieldLabel htmlFor="combobox-topic">Topic</FieldLabel>
              <Combobox items={topics} defaultValue={topics[6]}>
                <ComboboxInput id="combobox-topic" placeholder="Search a topic" showClear className="w-full" />
                <ComboboxContent>
                  <ComboboxEmpty>No topic of that name.</ComboboxEmpty>
                  <ComboboxList>
                    {(topic: string) => (
                      <ComboboxItem key={topic} value={topic}>
                        {topic}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>
          </Example>
          <Example title="In groups" className="items-start">
            <Combobox items={topicGroups}>
              <ComboboxInput aria-label="Topic" placeholder="Search a topic" className="w-full" />
              <ComboboxContent>
                <ComboboxEmpty>No topic of that name.</ComboboxEmpty>
                <ComboboxList>
                  {(group: (typeof topicGroups)[number], index: number) => (
                    <ComboboxGroup key={group.value} items={group.items}>
                      <ComboboxLabel>{group.value}</ComboboxLabel>
                      <ComboboxCollection>
                        {(topic: string) => (
                          <ComboboxItem key={topic} value={topic}>
                            {topic}
                          </ComboboxItem>
                        )}
                      </ComboboxCollection>
                      {index < topicGroups.length - 1 && <ComboboxSeparator />}
                    </ComboboxGroup>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </Example>
          <Example title="Several, as chips" className="items-start">
            <TopicsWithChips />
          </Example>
          <Example title="Disabled, and invalid">
            <Combobox items={topics} defaultValue={topics[6]} disabled>
              <ComboboxInput aria-label="Topic" disabled className="w-full" />
              <ComboboxContent>
                <ComboboxList>
                  {(topic: string) => (
                    <ComboboxItem key={topic} value={topic}>
                      {topic}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <Combobox items={topics}>
              <ComboboxInput aria-label="Topic" placeholder="Search a topic" aria-invalid="true" className="w-full" />
              <ComboboxContent>
                <ComboboxEmpty>No topic of that name.</ComboboxEmpty>
                <ComboboxList>
                  {(topic: string) => (
                    <ComboboxItem key={topic} value={topic}>
                      {topic}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </Example>
        </Examples>
      </Block>

      <Block name="Checkbox" file="checkbox" line="Yes or no in a form, and each of several things that may all be chosen.">
        <Example title="States, not ticked and ticked">
          <StateMatrix
            rows={["not ticked", "ticked"] as const}
            states={fieldStates}
            render={(row, state) => (
              <Checkbox
                aria-label="Show warnings"
                defaultChecked={row === "ticked"}
                aria-invalid={state === "invalid" || undefined}
                {...previewState(state)}
              />
            )}
          />
        </Example>
        <Example title="Typical: a set with a legend" className="items-start">
          <FieldSet>
            <FieldLegend variant="label">States to show</FieldLegend>
            <FieldDescription>Home lists the machines in these states first.</FieldDescription>
            <FieldGroup data-slot="checkbox-group">
              {["Alarm", "Stopped", "No data"].map((state, index) => (
                <Field key={state} orientation="horizontal">
                  <Checkbox id={`checkbox-${index}`} defaultChecked={index < 2} />
                  <FieldLabel htmlFor={`checkbox-${index}`} className="font-normal">
                    {state}
                  </FieldLabel>
                </Field>
              ))}
            </FieldGroup>
          </FieldSet>
        </Example>
      </Block>

      <Block name="Radio group" file="radio-group" line="One of a few options that all stay in view, in a form.">
        <Example title="States, not chosen and chosen">
          <StateMatrix
            rows={["not chosen", "chosen"] as const}
            states={fieldStates}
            render={(row, state) => (
              <RadioGroup defaultValue={row === "chosen" ? "8" : undefined} className="w-fit">
                <RadioGroupItem
                  value="8"
                  aria-label="Last 8 hours"
                  aria-invalid={state === "invalid" || undefined}
                  {...previewState(state)}
                />
              </RadioGroup>
            )}
          />
        </Example>
        <Example title="Typical: a set with a legend" className="items-start">
          <FieldSet>
            <FieldLegend variant="label">History of a machine</FieldLegend>
            <RadioGroup defaultValue="8">
              {hours.map((hour) => (
                <Field key={hour.value} orientation="horizontal">
                  <RadioGroupItem value={hour.value} id={`radio-${hour.value}`} />
                  <FieldLabel htmlFor={`radio-${hour.value}`} className="font-normal">
                    {hour.label}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>
        </Example>
      </Block>

      <Block name="Switch" file="switch" line="A setting that is on or off and takes effect at once.">
        <Example title="States, off and on">
          <StateMatrix
            rows={["off", "on"] as const}
            states={fieldStates}
            render={(row, state) => (
              <Switch
                aria-label="Read the values again every ten seconds"
                defaultChecked={row === "on"}
                aria-invalid={state === "invalid" || undefined}
                {...previewState(state)}
              />
            )}
          />
        </Example>
        <Examples>
          <Example title="Typical: with a description" className="items-start">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="switch-live">Live</FieldLabel>
                <FieldDescription>Read the values again every ten seconds.</FieldDescription>
              </FieldContent>
              <Switch id="switch-live" defaultChecked />
            </Field>
          </Example>
          <Example title="Sizes: sm, default">
            <Switch size="sm" aria-label="Live" defaultChecked />
            <Switch aria-label="Live" defaultChecked />
          </Example>
        </Examples>
      </Block>

      <Block name="Slider" file="slider" line="A value in a range, set roughly and by feel. For an exact number take a number field.">
        <Examples>
          <Example title="Typical: with its label and its value" className="items-start">
            <WarnAbove />
          </Example>
          <Example title="A range, and disabled" className="flex-col items-stretch gap-6">
            <Slider aria-label="Band of the bearing temperature" defaultValue={[35, 55]} min={20} max={80} step={1} />
            <Slider aria-label="Warn above" defaultValue={[55]} min={20} max={80} step={1} disabled />
          </Example>
        </Examples>
      </Block>

      <Block
        name="Number field"
        file="number-field"
        ours
        line="A number with its range, its step and its format: a set point, a limit. The arrow keys step, Shift steps by ten, and a button repeats while it is held."
      >
        <Examples>
          <Example title="Typical: a limit with its unit, in a field" className="items-start">
            <Field>
              <FieldLabel htmlFor="number-limit">Warn above</FieldLabel>
              <NumberField
                id="number-limit"
                defaultValue={55}
                min={20}
                max={80}
                format={{ style: "unit", unit: "celsius", maximumFractionDigits: 1 }}
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement />
                  <NumberFieldInput />
                  <NumberFieldIncrement />
                </NumberFieldGroup>
              </NumberField>
              <FieldDescription>The bearing temperature of spindle 1, between 20 and 80 °C.</FieldDescription>
            </Field>
          </Example>
          <Example title="A fraction shown as a percentage, and a label to drag" className="items-start">
            <NumberField
              id="number-override"
              defaultValue={0.95}
              min={0}
              max={1.2}
              step={0.01}
              format={{ style: "percent" }}
            >
              <NumberFieldScrubArea>
                <label htmlFor="number-override">Feed override</label>
              </NumberFieldScrubArea>
              <NumberFieldGroup>
                <NumberFieldDecrement />
                <NumberFieldInput />
                <NumberFieldIncrement />
              </NumberFieldGroup>
            </NumberField>
          </Example>
        </Examples>
        <Example title="States. The ring of the focus lies on the whole field, so it shows only on a field that has the focus.">
          <StateMatrix
            rows={["number field"] as const}
            states={["default", "disabled", "invalid", "at its maximum"]}
            render={(_, state) => (
              <NumberField
                className="w-36"
                defaultValue={state === "at its maximum" ? 80 : 55}
                min={20}
                max={80}
                disabled={state === "disabled"}
              >
                <NumberFieldGroup>
                  <NumberFieldDecrement />
                  <NumberFieldInput aria-label="Warn above" aria-invalid={state === "invalid" || undefined} />
                  <NumberFieldIncrement />
                </NumberFieldGroup>
              </NumberField>
            )}
          />
        </Example>
        <Example title="Next to an input and an input group: the same height, border and radius">
          <Input aria-label="Program" defaultValue="SHAFT_4711.MPF" className="w-44" />
          <NumberField className="w-36" defaultValue={55} min={20} max={80}>
            <NumberFieldGroup>
              <NumberFieldDecrement />
              <NumberFieldInput aria-label="Warn above" />
              <NumberFieldIncrement />
            </NumberFieldGroup>
          </NumberField>
          <InputGroup className="w-36">
            <InputGroupInput aria-label="Warn above" defaultValue="55" />
            <InputGroupAddon align="inline-end">
              <InputGroupText>°C</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        </Example>
      </Block>

      <Block
        name="OTP field"
        file="otp-field"
        ours
        line="A short code, one character a slot. Typing moves on, Backspace moves back, and a pasted code fills every slot."
      >
        <Examples>
          <Example title="Typical: six digits in two groups, in a field" className="items-start">
            <Field>
              <FieldLabel htmlFor="otp-code">Verification code</FieldLabel>
              <OTPField id="otp-code" length={6} aria-describedby="otp-code-description">
                <CodeSlots />
              </OTPField>
              <FieldDescription id="otp-code-description">The six digits that were sent to you.</FieldDescription>
            </Field>
          </Example>
          <Example title="Letters and digits, in one group" className="items-start">
            <Field>
              <FieldLabel htmlFor="otp-recovery">Recovery code</FieldLabel>
              <OTPField id="otp-recovery" length={4} validationType="alphanumeric" defaultValue="A7C">
                <OTPFieldGroup>
                  <OTPFieldInput />
                  <OTPFieldInput aria-label="Character 2 of 4" />
                  <OTPFieldInput aria-label="Character 3 of 4" />
                  <OTPFieldInput aria-label="Character 4 of 4" />
                </OTPFieldGroup>
              </OTPField>
            </Field>
          </Example>
        </Examples>
        <Example title="States">
          <StateMatrix
            rows={["default", "filled", "focus", "disabled", "invalid"] as const}
            states={["six slots"]}
            render={(state) => (
              <>
                <Label htmlFor={`otp-${state}`} className="sr-only">
                  Verification code
                </Label>
                <OTPField
                  id={`otp-${state}`}
                  length={6}
                  defaultValue={state === "default" ? undefined : state === "filled" ? "471120" : "47"}
                  disabled={state === "disabled"}
                >
                  <CodeSlots
                    slot={(index) =>
                      state === "invalid"
                        ? { "aria-invalid": true }
                        : state === "focus" && index === 2
                          ? { "data-preview": "focus" }
                          : undefined
                    }
                  />
                </OTPField>
              </>
            )}
          />
        </Example>
        <Example title="Next to an input: the same height, border and radius">
          <Input aria-label="Program" defaultValue="SHAFT_4711.MPF" className="w-44" />
          <Label htmlFor="otp-beside" className="sr-only">
            Verification code
          </Label>
          <OTPField id="otp-beside" length={3} defaultValue="471">
            <OTPFieldGroup>
              <OTPFieldInput />
              <OTPFieldInput aria-label="Character 2 of 3" />
              <OTPFieldInput aria-label="Character 3 of 3" />
            </OTPFieldGroup>
          </OTPField>
        </Example>
      </Block>

      <Block
        name="Direction"
        file="direction"
        line="Tells the components that a part of the page reads from right to left. The provider alone mirrors nothing: the element also says dir. The components of this repository are generated without right-to-left classes, so not every one mirrors."
      >
        <Example title="The same fields from right to left: the layout mirrors, the words stay as they are written" className="items-start">
          <DirectionProvider direction="rtl">
            <FieldGroup dir="rtl" className="grid gap-6 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="rtl-machine">Machine</FieldLabel>
                <Select items={machines} defaultValue="P-04">
                  <SelectTrigger id="rtl-machine" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {machines.map((machine) => (
                        <SelectItem key={machine.label} value={machine.value}>
                          {machine.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <FieldSet>
                <FieldLegend variant="label">States to show</FieldLegend>
                <FieldGroup data-slot="checkbox-group">
                  {["Alarm", "Stopped"].map((state) => (
                    <Field key={state} orientation="horizontal">
                      <Checkbox id={`rtl-${state}`} defaultChecked />
                      <FieldLabel htmlFor={`rtl-${state}`} className="font-normal">
                        {state}
                      </FieldLabel>
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </DirectionProvider>
        </Example>
      </Block>
    </Section>
  )
}
