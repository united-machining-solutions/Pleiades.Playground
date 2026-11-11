// What the two discovery tools and the skill resource say about this server.

export const description = `genui is the generative UI backend of the Pleiades Playground.

Its tools read the Timeseries API and the Events API and return what a display needs: the values,
where each value comes from, and since when it has lasted. Numbers, order and durations are computed
here, never by a language model.

A result is an answer, not raw data. Its text says in words what the values are, and a host that
shows MCP Apps draws them as a card. So a question about a machine takes one call and no preparation:
call the tool that fits the question. genui_get_skill_guide explains the values, for a reader that
works with them.

Tools:
- genui_machine_list: every machine with what it does now.
- genui_machine_show: one machine with what it does now and what it did over the last hours.
- genui_describe_server: this text.
- genui_get_skill_guide: the conventions of this server as markdown.`

export const skillGuide = `# genui: skill guide

## A result is an answer

- The text of a result says in words what a display shows: what a machine does, since when, with
  which program, and for one machine how long each state lasted over the last hours. The values
  next to the text are for a display.
- A host that shows MCP Apps draws the result of \`genui_machine_show\` as the machine card. The
  person then sees every value. Say what matters in a sentence or two. Do not list the values again,
  and do not draw them again.
- The rest of this guide is for a reader that works with the values.

## What the values contain

- Every instant is ISO 8601. It is in UTC, unless the call names a \`timeZone\`: then it is a local
  time there with its offset, for example \`2026-11-11T09:00:41.000+01:00\`.
- To a person, say a time the way a clock does, \`09:00\`: the hours and minutes as they stand in
  the result. Do not convert them. Say "UTC" with a time that is in UTC, and nothing with a local one.
- Every reading carries its \`topic\`, every notification the topic it was published on.
- A reading has \`value\`, \`at\` (when it was measured) and \`since\` (since when it has been the same).
  If \`sinceIsLowerBound\` is true, the value was already the same before the values that were read,
  and \`since\` is the earliest time known. Say "for at least", not "since".
- A machine may publish a value only when it changes. A value holds until the next one of its topic,
  so an \`at\` of hours ago is not stale by itself.
- A machine is there while it gives signs of life: its heartbeat, or any value it publishes. Silent
  for more than 30 seconds, it is not, and its values are the last known ones, not the present. Such
  a silence also ends a run, because what the value was in between is not known: \`since\` is then
  the first value after the silence.
- Units are SI on the wire; a display converts them.

## Machines

\`genui_machine_list\` lists every machine that published a value in the last 24 hours. Pass the
\`timeZone\` of the person you answer, if you know it.

- \`connection\`: \`umati/Connection/State\`. Anything but \`Connected\` means the other readings are the
  last known ones, not the present.
- \`heartbeat\`: \`umati/Connection/Heartbeat\`, the sign of life. Its value counts up and says nothing
  else; its \`at\` is what matters.
- \`lastValueAt\`: the newest \`at\` of all readings, so the last sign of life. More than 30 seconds
  before \`asOf\`, the machine is silent.
- \`itemState\`: \`umati/State/MachineryItemState\`, for example \`Executing\` or \`NotExecuting\`.
- \`operationMode\`: \`umati/State/MachineryOperationMode\`, for example \`Processing\` or \`Setup\`.
- \`program\`: \`umati/Production/ActiveProgram\`.
- \`notifications\`: warnings and errors that were raised in the last 24 hours and have not gone,
  newest first. One that has stood for longer is not among them, so an empty list does not rule it out.

Do not derive a reason for a stop that the data does not give: a machine that stands without an open
notification stands for a reason nobody recorded.

## One machine

\`genui_machine_show\` takes the serial number (\`machine\`) and returns the same readings for that
machine, and its \`history\`: the states between \`from\` and \`to\` as spans without a gap, oldest
first. \`hours\` says how far back the history goes, 8 if omitted, 24 at most.

A span has one of five states, decided from the values in this order:

- \`no-data\`: no sign of life for more than 30 seconds, or the connection is not \`Connected\`.
- \`alarm\`: an error was raised and has not gone.
- \`setup\`: the operation mode is \`Setup\`.
- \`stopped\`: the item state is anything but \`Executing\`.
- \`running\`: everything else.

\`history.totals\` says how long each state lasted in total between \`from\` and \`to\`, in seconds.
The sums are added up here, from the spans. Take them from there: do not add up spans, and do not
count states yourself.
`
