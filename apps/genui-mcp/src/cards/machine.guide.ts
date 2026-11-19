// What the skill guide of the server says about the machine card: its sections, as markdown.

export const machineGuide = `## Machines

\`genui_machine_list\` lists every machine that published a value in the last 24 hours. Pass the
\`timeZone\` of the person you answer, if you know it. A machine is named by its id (\`machine\`),
\`<manufacturer>_<model>_<serial number>\`, the level after \`machines/\` in every topic; name it to a
person by its \`identity\`: manufacturer, model, serial number and, where the machine names it, its device class.

A tool about one machine takes its id or what people call it: words of the id in their order, such
as the serial number (\`P-04\`) or the model and serial number (\`AX-400 P-04\`). Pass the name the
person used; you need not list the machines first to learn the id. A name that fits several machines
is refused with their ids, and one that fits none with the ids of every machine.

- \`connection\`: \`umati/Connection/State\`, the state of the adapter. Anything but \`Running\`
  (\`Initializing\`, \`CommunicationFault\`, \`Shutdown\`) means the other readings are the last known
  ones, not the present.
- \`heartbeat\`: \`umati/Connection/Heartbeat\`, the sign of life. Its value counts up and says nothing
  else; its \`at\` is what matters.
- \`lastValueAt\`: the newest \`at\` of all readings, so the last sign of life. More than 30 seconds
  before \`asOf\`, the machine is silent.
- \`itemState\`: \`umati/State/Status/MachineryItemState\`, for example \`Executing\` or \`NotExecuting\`.
- \`operationMode\`: \`umati/State/Status/MachineryOperationMode\`, for example \`Processing\` or \`Setup\`.
- \`program\`: \`umati/WorkMasterMonitoring/ActiveWorkMaster\`, the work master the machine carries out.
- \`jobOrder\`: the job order that runs or is interrupted, with its produced quantity and the runs planned.
- \`notifications\`: alerts that were raised in the last 24 hours and have not been cleared, newest
  first, with their category after NAMUR NE 107 (\`severity\`); a \`Failure\` is an error (\`level\`), every
  other category a warning. One that has stood for longer is not among them, so an empty list does not
  rule it out.

Do not derive a reason for a stop that the data does not give: a machine that stands without an open
alert stands for a reason nobody recorded.

## One machine

\`genui_machine_show\` takes the machine (\`machine\`) and returns the same readings for that
machine, and its \`history\`: how long each state lasted in total between \`from\` and \`to\`
(\`totals\`, in seconds). \`hours\` says how far back the history goes, 8 if omitted, 24 at most.
The sums are added up here. Take them from there, and do not count states yourself.

The states themselves, as spans without a gap and oldest first, are what a card draws as a band.
They grow with time, so they are not in that result: a card asks \`genui_span_list\` for them, with
\`history.from\` and \`history.to\`. A question about how long or how often is answered by the sums.
Ask for the spans only to say when something happened.

A span has one of five states, decided from the values in this order:

- \`no-data\`: no sign of life for more than 30 seconds, or the connection is not \`Running\`.
- \`alarm\`: an alert \`Failure\` was raised and has not been cleared.
- \`setup\`: the operation mode is \`Setup\`.
- \`stopped\`: the item state is anything but \`Executing\`.
- \`running\`: everything else.

A band has room for a few hundred spans. A history with more is thinned to that many: each slot of
the band then shows the state that lasted longest in it, and an alarm always keeps a slot, so none
is thinned away. The sums are not affected: they are added up from every span.

## Job orders

\`genui_job_order_list\` lists the job orders on the lists of the machines whose last event lies in
the last 24 hours, of every machine or of one (\`machine\`): what is ordered (\`state\`, \`jobName\`,
\`workMaster\`, \`orderNumbers\`, \`runsPlanned\`) and what came of it from its start (\`start\`, \`end\`,
\`produced\`, \`good\`, \`result\`). Job orders that name the same order number belong to one order of
the ERP, also on different machines. A job order without an order number is an order of its own.
A job order \`Aborted\` without a \`start\` never ran: the planner took it back.
`
