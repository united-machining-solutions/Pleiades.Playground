# genui-mcp

The generative UI backend: an MCP server whose tools read the Timeseries API and the Events API and return
what a display needs. Every value names the topic or the notification it comes from, and numbers, order and
durations are computed here, never by a language model.

| | |
|---|---|
| In the demo stack | <http://localhost:5520/mcp> (streamable HTTP), port from `GENUI_MCP_PORT` |
| For a desktop host | stdin and stdout, when started with `--stdio` |
| Liveness | `GET /health` |
| Image | `pleiades.playground.genui.mcp` |
| Settings | `TIMESERIES_API_URL`, `EVENTS_API_URL`, `CARD_RESOURCE_DOMAINS` (optional, see the card below) |

## Tools

| Tool | What it returns |
|---|---|
| `genui_machine_list` | Every machine with what it does now: connection, heartbeat, state and operation mode with the time since when, the active program, and the warnings and errors of the last 24 hours that have not gone. |
| `genui_machine_show` | One machine (`machine`, the serial number): the same readings, and how long each state lasted in total over the last hours (`hours`, 8 if omitted). Its output is the contract of the machine card in [`@pleiades/cards`](../../packages/cards/README.md). |
| `genui_span_list` | The states of one machine between two instants (`from`, `to`) as spans without a gap: the band of the machine card. A card calls it after `genui_machine_show`. A host that shows MCP Apps does not offer it to its language model. |
| `genui_describe_server`, `genui_get_skill_guide` | The discovery tools every server of this repository has. The guide is also the resource `genui://skill`. A question about a machine needs neither: a result answers it. |

| Resource | What it is |
|---|---|
| `genui://skill` | The skill guide, as markdown. |
| `ui://genui/machine` | The machine card as a file for other hosts, see below. |

Every instant of a result is ISO 8601 in UTC. The two machine tools also take a `timeZone`, an IANA name such
as `Europe/Zurich`: then every instant is a local time there with its offset, `2026-11-11T09:00:41.000+01:00`.
So whoever reads the result, a language model included, has nothing to convert.

## A result is an answer

A result has two parts, for two readers:

- **Its text is for a language model**, and for a host that shows nothing else. It says in words what a
  display shows: what a machine does, since when, with which program, and for one machine how long each
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
  only when the state changes, and one that runs for days says once that it is connected; a simulator repeats
  it every few seconds. Both read the same.
- **Every value is a sign of life**, and the heartbeat is one that is nothing else. A machine that gave no sign
  for more than 30 seconds is silent: it has no data, whatever its last values say.
- **A silence ends a run.** What a value was while the machine was silent is not known, so "since" is the
  first value after the silence.

## Known limit

A warning or an error that has stood for more than 24 hours is not in a result: not in the list, not on a
card and not in the history of a machine. All three look back 24 hours, from now or from where a history
ends, so the state of a machine and the end of its history say the same. The Events API returns
the notifications that were raised between two instants; it cannot be asked for the ones that are open. Reading
every notification of the retention time on each call would be the only way around it here. A filter for open
notifications in the Events API would solve it.

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
- `src/server.ts`: the MCP server, its tools and its resources. An application imports its type and calls it
  with `createMCPClient<typeof server>`.
- `src/card-file.ts`: reads a built card file, and says what a card tells a host about itself.
- `src/names.ts`: the names the server and its card files share.
- `ui/`: the card files, which run in a host and not in Node.js. `machine.tsx` takes the result from the host
  and draws the machine card, `vite.config.ts` builds it into one HTML file.
- `src/machines.ts`: what a machine does now. The shape of a machine is a contract of the card catalogue,
  [`@pleiades/cards`](../../packages/cards/README.md), because cards show it.
- `src/history.ts`: the states of a machine over a stretch of time, as spans, their sums, and the thinning
  for a band. Which values are which state is decided in the card catalogue, for the past as for the present.
- `src/liveness.ts`: the stretches in which a machine gave no sign of life.
- `src/apis.ts`: the two APIs over REST. Every answer is checked against the shape this server relies on.
- `src/time.ts`: the Timeseries API counts microseconds, the Events API writes ISO 8601; from here on an
  instant is ISO 8601 in UTC. A result is written in the time zone of the caller at the very end.
