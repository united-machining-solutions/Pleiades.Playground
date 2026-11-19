# genui-mcp

The generative UI backend: an MCP server whose tools read the Timeseries API, the Events API and, for the site
card, the Sites API, and return what a display needs. Every value names the topic or the notification it comes
from, and numbers, order and durations are computed here, never by a language model.

| | |
|---|---|
| In the demo stack | <http://localhost:5520/mcp> (streamable HTTP), port from `GENUI_MCP_PORT` |
| For a desktop host | stdin and stdout, when started with `--stdio` |
| Liveness | `GET /health` |
| Image | `pleiades.playground.genui.mcp` |
| Settings | `TIMESERIES_API_URL`, `EVENTS_API_URL`, `SITES_API_URL` (the site card), `CARD_RESOURCE_DOMAINS` (optional, see the card below) |

## Tools

| Tool | What it returns |
|---|---|
| `genui_energy_show` | Every machine that published active power or its energy meter, or those in `machines`, over the last hours (`hours`, 8 if omitted, at most 24): the energy it imported, the difference of its meter in the unit the meter published in (watt hours, or joule for values from before the data model 0.17.1), unconverted; the mean power over that time, the energy divided by it; and the peak of its active power in watt, from the statistics of the Timeseries API. Machines in watt hours first, then those in joule, each the one that imported the most first. Its output is the contract of the energy card in [`@pleiades/cards`](../../packages/cards/README.md). |
| `genui_energy_series` | The active power of machines between two instants (`from`, `to`, at most 24 hours), a line for each machine on the same instants (`slots`, 240 if omitted): the graph of the energy card. Each value is the one that held at its instant, the newest of those the Timeseries API keeps when it thins a line to twice the slots; none where the machine was silent, as in the graphs of the measurements. A card calls it after `genui_energy_show`. A host that shows MCP Apps does not offer it to its language model. |
| `genui_machine_list` | Every machine with what it does now: manufacturer, model and serial number, connection, heartbeat, state and operation mode with the time since when, the active work master and job order, and the alerts of the last 24 hours that have not been cleared. |
| `genui_machine_show` | One machine (`machine`, the machine id): the same readings, and how long each state lasted in total over the last hours (`hours`, 8 if omitted). Its output is the contract of the machine card in [`@pleiades/cards`](../../packages/cards/README.md). |
| `genui_span_list` | The states of one machine between two instants (`from`, `to`) as spans without a gap: the band of the machine card. A card calls it after `genui_machine_show`. A host that shows MCP Apps does not offer it to its language model. |
| `genui_job_order_list` | The job orders on the lists of the machines whose last event lies in the last 24 hours, of every machine or of one (`machine`), from the Events API (`/jobOrders`): state, job name, work master, the order numbers of the ERP (empty ones left out), runs planned, and what came of each from its start: start, end, produced and good quantity, result. Every instant in UTC, or in `timeZone`. One that left the list of its machine is not among them. The page "Where is My Job?" of the example app reads it, so it knows the job orders also when the retained lists of the broker reached it before the page. |
| `genui_measurement_list` | Every machine, or one (`machine`), with the newest value of each physical quantity: active power, energy imported, spindle bearing temperature, whether the spindle rotates, feed and spindle override, power-on duration. Each in the unit it was published in, and whether it is current: a value holds until the next one, as long as the machine is there (see below). Its output is the contract of the measurement card in [`@pleiades/cards`](../../packages/cards/README.md). |
| `genui_measurement_series` | Every physical quantity over the last minutes (`minutes`, 15 if omitted), a line for each machine on the same instants (`slots`, 180 if omitted): what the graphs of the measurements draw. Each point is the value that held at its instant, also one published before the minutes began; none while the machine is silent, and none after a silence until the next value. The card file of the measurements calls it and draws the graphs below its cards; the page "Live values" of the example app calls it too. A host that shows MCP Apps does not offer it to its language model. |
| `genui_notification_list` | The warnings and errors of one machine (`machine`, its machine id) over the last hours (`hours`, 8 if omitted, 24 at most): each alert once with its error code, message and category, when it was raised, when it was cleared and how long it stood in seconds, or that it has not gone. A `Failure` is an error, every other category a warning. The ones that have not gone come first, and they are the ones `genui_machine_list` names: an alert that has not been cleared and is older than 24 hours is in neither. An alert that was raised before the range and stood into it has its real raised time and its whole duration. `levels` counts the errors and the warnings and adds up how long each level stood. `hasMore` passes on that the Events API had more than it returned (1000 at most). Its output is the contract of the notification card in [`@pleiades/cards`](../../packages/cards/README.md). |
| `genui_site_list` | Every site of the [Sites API](../../source/Pleiades.Playground.Sites.Api/README.md) with the machines on it, hall by hall, what each does now and how many on each site are in each state, how many on all sites send and how many need someone; and the machines that sent values in the last 24 hours and stand on no site. If the Sites API does not answer, every such machine stands on no site and `sitesError` says why. Its output is the contract of the site card in [`@pleiades/cards`](../../packages/cards/README.md). |
| `genui_timeseries_show` | Signals of machines over the last `range` (`15m`, `1h`, `8h` or `24h`, `1h` if omitted), in the `timeZone` of the person if given, a line for each pair of a machine and a signal in `lines`, freely combined, at most 8. A signal is named by its path below the machine, as an element of the data model, or as a quantity of the measurement card, and must be a number or a yes or no the machine published in the last 24 hours; numbers of at most two units. For each line the newest value and whether it is current, and the smallest and largest value in the range from the statistics of the Timeseries API, in the unit it was published in. Its output is the contract of the time series card in [`@pleiades/cards`](../../packages/cards/README.md). |
| `genui_timeseries_series` | The values of the lines of a time series card over a range, up to `to` or up to now, on the instants of all of them: every instant at which a line has a value. Numbers are thinned by the Timeseries API (`points`, 480 if omitted) and keep their own instants; a yes or no is read whole. At each instant a line has the value that held, none where the machine was silent. The card calls it after `genui_timeseries_show` and again when a person changes the range or the lines. A host that shows MCP Apps does not offer it to its language model. |
| `genui_timeseries_signals` | The numbers and yes or no each machine published in the last 24 hours, by path: what a person can add to a time series card. The card calls it. A host that shows MCP Apps does not offer it to its language model. |
| `genui_describe_server`, `genui_get_skill_guide` | The discovery tools every server of this repository has. The guide is also the resource `genui://skill`. A question about a machine needs neither: a result answers it. |

| Resource | What it is |
|---|---|
| `genui://skill` | The skill guide, as markdown. |
| `ui://genui/energy` | The energy card as a file for other hosts: the energy of each machine, and the graph of their power, which it asks `genui_energy_series` for. |
| `ui://genui/machine` | The machine card as a file for other hosts, see below. |
| `ui://genui/site` | The site card as a file for other hosts: a card for each site, and one for the machines on no site. |
| `ui://genui/measurement` | The measurement card as a file for other hosts: the cards, and below them the graphs of the last minutes, which it asks `genui_measurement_series` for, as the machine card asks for its band. |
| `ui://genui/notification` | The notification card as a file for other hosts. |
| `ui://genui/timeseries` | The time series card as a file for other hosts: the lines of the result, which it asks `genui_timeseries_series` for, again when a person changes the range or the lines, and what a person can add, which it asks `genui_timeseries_signals` for. |

Every instant of a result is ISO 8601 in UTC. The tools a language model calls, `genui_timeseries_show` among
them, also take a `timeZone`, an IANA name such as `Europe/Zurich`: then every instant is a local time there with
its offset, `2026-11-11T09:00:41.000+01:00`. So whoever reads the result, a language model included, has nothing
to convert.

## A result is an answer

A result has two parts, for two readers:

- **Its text is for a language model**, and for a host that shows nothing else. It says in words what a
  display shows: what a machine does, since when, with which work master, and for one machine how long each
  state lasted over the last hours. A few lines, in the words of the card.
- **Its values (`structuredContent`) are for a display.** The example application and the card file draw
  them.

A model adds nothing up: the sums come from here (`history.totals`). The text of `genui_machine_show`
ends with a note for a model: where the host shows MCP Apps, the person already sees the card, and a
sentence or two is the whole answer.

Hosts differ in what they give a model. The standard for MCP Apps gives it the text. Some hosts give it
the values instead, among them the chat of the example application, through its client library. So the
values are short too. The rule is: **what a model reads is short, and a series is fetched by the card
itself.**

- What grows with time or with the number of things is not a value of a result. The spans of the band
  are a tool of their own, `genui_span_list`, which only a card calls.
- A card asks for its series with the `from` and `to` of its values, so the band and the sums are about
  the same hours.
- A result stands without its series. Where a host lets no card call a tool, or the data is gone, the
  card shows the state and the sums and leaves the band out.
- A series is bounded. A band has room for 720 spans; a longer history is thinned to that many. Each slot
  then shows the state that lasted longest in it, so the band keeps its proportions, and an alarm always
  keeps a slot, so none is thinned away. A thinned band therefore shows a short alarm wider than it was;
  how long it lasted is in the sums, which are added up from every span.

## The machine card for other hosts

`genui_machine_show` links a card file: its `_meta.ui.resourceUri` names the resource `ui://genui/machine`, an
[MCP App](https://modelcontextprotocol.io/extensions/apps/overview). A host that shows MCP Apps loads the
file, puts it next to the answer and sends it the result of the tool. The file checks the result against the
contract of the card and draws `MachineCard` of [`@pleiades/cards`](../../packages/cards/README.md): the
component the example application draws itself, with the same theme. So a card is one component in two
wrappers: an application that imports it, and one HTML file for every other host.

- The file is a single HTML page with its script and its styles inside, about 580 kB and 160 kB compressed.
  It loads nothing from anywhere, so a host has no origin to allow for it.
- It shows what the result says and nothing newer. It asks the server for the spans of its band, through
  the host, and for nothing else: it does not refresh.
- It is light and draws the frame of the card itself. It says so to the host (`prefersBorder: false`), as the
  standard recommends, so no host puts a second frame around it. Times are written by the clock of the
  browser.
- The font is the one the host names, so the card reads like the conversation around it. A host that serves
  its font from an origin of its own has to find that origin in the resource (`csp.resourceDomains`), or its
  sandbox blocks the font and the card falls back to a system font. The setting `CARD_RESOURCE_DOMAINS`
  names those origins, separated by commas: `https://assets.claude.ai` for the Claude apps, for example.
  Without it the card names none.
- It travels alone, so it carries its notices: a comment at its end holds the `NOTICE` of this repository
  and the licence of every package the build put into the file.

To see it, add `http://localhost:5520/mcp` to a host that shows MCP Apps and ask for one machine. A host that
runs somewhere else needs an address it can reach.

Without a host and without a language model, a script stands in for one:
`node .claude/skills/build-your-own/show-card.mjs genui_machine_show machine=alcyone-machines_AX-400_P-04` calls the tool, reads the
card file it links and serves a page that hands the file the result, as a host does. A tool the card calls
itself goes on to this server. It is what the recipe `create-card` looks at a new card with.

### In a desktop host

A desktop host starts a server as a process of its own and talks to it on stdin and stdout. Started with
`--stdio`, this server answers there instead of on a port. With the demo stack running, the image is enough,
for example as an entry in the configuration file of the Claude desktop app:

```json
{
  "mcpServers": {
    "pleiades-genui": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--no-healthcheck",
        "--network", "pleiades-playground_default",
        "-e", "TIMESERIES_API_URL=http://timeseries-api:8080",
        "-e", "EVENTS_API_URL=http://events-api:8080",
        "-e", "SITES_API_URL=http://sites-api:8080",
        "-e", "CARD_RESOURCE_DOMAINS=https://assets.claude.ai",
        "ghcr.io/united-machining-solutions/pleiades.playground.genui.mcp:dev",
        "--stdio"
      ]
    }
  }
}
```

## When a machine is there

The [MQTT binding](../../contracts/mqtt/README.md) has no quality field: whether values are current is told
by `Connection/State` and `Connection/Heartbeat`. This server reads it so:

- **A value holds until the next one of its topic**, however long that takes. A machine may publish its state
  only when the state changes, and one that runs for days says once that its adapter is `Running`; another
  repeats it every few seconds. Both read the same.
- **Every value is a sign of life**, and the heartbeat is one that is nothing else. A machine that gave no sign
  for more than 30 seconds is silent: it has no data, whatever its last values say.
- **A silence ends a run.** What a value was while the machine was silent is not known, so "since" is the
  first value after the silence.

## Known limit

A warning or an error that has stood for more than 24 hours is not in a result: not in the list, not on a
card and not in the history of a machine. All three look back 24 hours, from now or from where a history
ends, so the state of a machine and the end of its history say the same. This server reads the alerts that
were raised in those 24 hours (`/alerts/pairs` of the Events API). The Events API also names the alerts that stand
now, however old (`/alerts/active`); it has no such view for an earlier instant, where a history ends. Reading
the active alerts for the list, and every alert of the retention time for a history, would lift the limit.

## When an API fails

A tool call fails with a sentence that names the API, what happened and where, for example
`The Timeseries API did not answer: ECONNREFUSED (http://timeseries-api:8080/topics).` The server writes the
same sentence to its log, once per failed request.

## Develop

```bash
pnpm install
pnpm --filter @pleiades/genui-mcp build   # the card files, to dist/ui
pnpm --filter @pleiades/genui-mcp dev     # http://localhost:5520/mcp, reads the APIs of the running demo stack
pnpm --filter @pleiades/genui-mcp test
```

The server has no build step. Node.js runs the TypeScript files as they are, so every import names its file
with `.ts`, and the code uses no syntax that needs compiling (enums, namespaces, parameter properties).
Node.js does that only outside `node_modules`. So the image keeps the layout of the workspace, where
`@pleiades/cards` is linked and not copied.

Only the card files are built. Vite writes each as one HTML file to `dist/ui`, and the server reads it there
when a host asks for the resource. Without a build the tools work, and the resource says how to build it.
What the card files need (React, the bundler) are development dependencies: the image keeps the built
files and not those.

## What is where

- `src/main.ts`: reads the settings and serves `/mcp` and `/health`, or with `--stdio` stdin and stdout.
- `src/server.ts`: the MCP server, the two tools with which a caller finds its way, and its resources. It
  names no card. An application imports its type and calls it with `createMCPClient<typeof server>`.
- `src/cards/`: one module for each card, and `index.ts`, which lists them: one line for a card, in the
  order of the alphabet. A module says what its card brings (`src/card.ts`): its tools, a line about each
  for the description of the server, its sections of the guide, and its card file. `machine.ts` is the
  machine card, `machine.guide.ts` its sections of the guide, and `machine.names.ts` the names it shares
  with its card file. The server, the description and the guide are put together from the list, so a new
  card adds one line there and changes nothing else.
- `src/tool.ts`: what the tools share: the context of a call, the annotations, a result in words, and the
  time zone a caller names.
- `src/guide.ts`: what the two discovery tools say about the server, around what the cards say.
- `src/card-file.ts`: reads a built card file, and says what a card tells a host about itself.
- `ui/`: the card files, which run in a host and not in Node.js. `machine.tsx` takes the result from the host
  and draws the machine card. `build.mjs` builds every page of the folder into one HTML file each, with
  `vite.config.ts`: a card adds its page and is named nowhere.
- `src/machines.ts`: what a machine does now. The shape of a machine is a contract of the card catalogue,
  [`@pleiades/cards`](../../packages/cards/README.md), because cards show it.
- `src/history.ts`: the states of a machine over a stretch of time, as spans, their sums, and the thinning
  for a band. Which values are which state is decided in the card catalogue, for the past as for the present.
- `src/liveness.ts`: the stretches in which a machine gave no sign of life.
- `src/sites.ts`: where the machines stand: the sites and placements of the Sites API with what each machine does now, grouped by hall and counted by state.
- `src/apis.ts`: the APIs over REST. Every answer is checked against the shape this server relies on.
- `src/time.ts`: the Timeseries API counts microseconds, the Events API writes ISO 8601; from here on an
  instant is ISO 8601 in UTC. A result is written in the time zone of the caller at the very end.
