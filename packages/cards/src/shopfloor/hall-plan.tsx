import type { ReactNode } from "react"

import { labelOf, serialOf } from "../machine/in-words.ts"
import { stateLabel } from "../machine/state.ts"
import type { Fixture, Hall, Place, Station } from "./contract.ts"

// The plan of the hall, from above, drawn like a layout planner draws it: a floor with the lines of
// the cells and aisles, racks with pallets along the walls, forklifts, and the machines at their
// places. A machine that runs is greyed out; one that does not stands out, with its reason above it.
// The drawing is in metre: one unit of the picture is one metre of the hall.

/** The colours of the plan: a light floor, light blue walls, dark lines, dark blue on the machines. */
const ink = {
  wall: "oklch(0.83 0.035 245)",
  wallEdge: "oklch(0.7 0.04 245)",
  floor: "oklch(0.965 0.003 250)",
  grid: "oklch(0.91 0.004 250)",
  line: "oklch(0.36 0.02 255)",
  label: "oklch(0.99 0 0)",
  body: "oklch(0.985 0.002 250)",
  bodyEdge: "oklch(0.5 0.03 255)",
  navy: "oklch(0.33 0.08 258)",
  glass: "oklch(0.72 0.06 240)",
  pallet: "oklch(0.86 0.05 75)",
  palletEdge: "oklch(0.64 0.06 70)",
  rack: "oklch(0.45 0.09 255)",
  forklift: "oklch(0.83 0.16 90)",
  shadow: "oklch(0.2 0.02 255 / 0.12)",
  alarm: "var(--state-alarm)",
  alarmTint: "oklch(0.95 0.04 25)",
  attention: "oklch(0.75 0.15 70)",
}

const WALL = 0.6
const TEXT = 0.5
/** The height of the dark blue strip on top of a machine, which carries its name. */
const STRIP = 1.2

/** How wide a text of this many letters is, in metre: enough to size the box around it. */
const widthOf = (text: string, size: number) => text.length * size * 0.56

export function HallPlan({
  hall,
  machines,
  highlight = [],
}: {
  hall: Hall
  machines: ReadonlyArray<Station>
  /** Machines a question is about: marked with a blue frame, and not greyed out. */
  highlight?: ReadonlyArray<string>
}) {
  const view = `${-WALL - 0.4} ${-WALL - 0.4} ${hall.width + 2 * WALL + 0.8} ${hall.depth + 2 * WALL + 2}`
  const notRunning = machines.filter((one) => !one.running).map((one) => one.machine)
  return (
    <svg
      viewBox={view}
      role="img"
      aria-label={`${hall.name}: plan with ${machines.length} machines${notRunning.length > 0 ? `; not running: ${notRunning.join(", ")}` : ", all running"}`}
      className="h-auto w-full select-none"
      fontFamily="inherit"
    >
      <defs>
        <pattern id="hall-grid" width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke={ink.grid} strokeWidth="0.03" />
        </pattern>
      </defs>
      {/* The walls, and the floor inside them. */}
      <rect
        x={-WALL}
        y={-WALL}
        width={hall.width + 2 * WALL}
        height={hall.depth + 2 * WALL}
        fill={ink.wall}
        stroke={ink.wallEdge}
        strokeWidth="0.06"
        rx="0.15"
      />
      <rect x="0" y="0" width={hall.width} height={hall.depth} fill={ink.floor} />
      <rect x="0" y="0" width={hall.width} height={hall.depth} fill="url(#hall-grid)" />
      {hall.fixtures.map((fixture, index) => (
        <FixtureShape key={index} fixture={fixture} />
      ))}
      {/* Machines that run first, so a machine that stands out is drawn over them. */}
      {[...machines]
        .sort((a, b) => Number(!a.running) - Number(!b.running))
        .map((station) => (
          <MachineShape key={station.machine} station={station} marked={highlight.includes(station.machine)} />
        ))}
      {machines
        .filter((one) => one.reason)
        .map((station) => (
          <Callout key={station.machine} place={station.place} text={station.reason!.message} state={station.state} />
        ))}
      <text x={hall.width - 0.2} y={hall.depth + WALL + 1.2} textAnchor="end" fontSize={TEXT * 0.9} fill={ink.line} opacity="0.7">
        {hall.name} · {hall.width} × {hall.depth} m
      </text>
    </svg>
  )
}

function FixtureShape({ fixture }: { fixture: Fixture }) {
  const { kind, place, label } = fixture
  const { x, y, width, depth } = place
  switch (kind) {
    case "cell":
      return (
        <g>
          <rect x={x} y={y} width={width} height={depth} fill="none" stroke={ink.line} strokeWidth="0.06" />
          {label && <Tag x={x + 0.3} y={y + depth - 0.3} text={label} />}
        </g>
      )
    case "aisle":
      return (
        <g>
          <rect x={x} y={y} width={width} height={depth} fill="oklch(0.94 0.004 250)" />
          <line x1={x} y1={y} x2={x + width} y2={y} stroke={ink.line} strokeWidth="0.05" strokeDasharray="0.6 0.4" />
          <line x1={x} y1={y + depth} x2={x + width} y2={y + depth} stroke={ink.line} strokeWidth="0.05" strokeDasharray="0.6 0.4" />
          {label && (
            <text x={x + width / 2} y={y + depth / 2 + TEXT * 0.35} textAnchor="middle" fontSize={TEXT} fill={ink.line} opacity="0.55" letterSpacing="0.15">
              {label.toUpperCase()}
            </text>
          )}
        </g>
      )
    case "rack":
      return <Rack place={place} label={label} />
    case "vehicle":
      return <Forklift place={place} />
    case "sign":
      return label ? <Tag x={x} y={y + depth} text={label} /> : null
  }
}

/** A small label on the floor, as a layout planner prints it: white, with a thin frame. */
function Tag({ x, y, text }: { x: number; y: number; text: string }) {
  const size = TEXT * 0.8
  const width = widthOf(text, size) + 0.5
  return (
    <g>
      <rect x={x} y={y - size - 0.25} width={width} height={size + 0.4} fill={ink.label} stroke={ink.line} strokeWidth="0.04" />
      <text x={x + 0.25} y={y - 0.15} fontSize={size} fill={ink.line}>
        {text}
      </text>
    </g>
  )
}

/** A rack with a row of pallets on it. */
function Rack({ place, label }: { place: Place; label: string | null }) {
  const { x, y, width, depth } = place
  const along = width >= depth
  const length = along ? width : depth
  const count = Math.max(1, Math.floor(length / 1.3))
  const step = length / count
  const pallets: ReactNode[] = []
  for (let index = 0; index < count; index++) {
    const px = along ? x + index * step + 0.1 : x + 0.15
    const py = along ? y + 0.15 : y + index * step + 0.1
    const pw = along ? step - 0.2 : width - 0.3
    const pd = along ? depth - 0.3 : step - 0.2
    pallets.push(<rect key={index} x={px} y={py} width={pw} height={pd} fill={ink.pallet} stroke={ink.palletEdge} strokeWidth="0.04" rx="0.05" />)
  }
  return (
    <g>
      <rect x={x + 0.15} y={y + 0.15} width={width} height={depth} fill={ink.shadow} />
      <rect x={x} y={y} width={width} height={depth} fill="none" stroke={ink.rack} strokeWidth="0.12" />
      {pallets}
      {label &&
        (along ? (
          <text x={x} y={y - 0.25} fontSize={TEXT * 0.8} fill={ink.line} opacity="0.7">
            {label}
          </text>
        ) : (
          <text x={x + width + 0.35} y={y + 0.2} fontSize={TEXT * 0.8} fill={ink.line} opacity="0.7" transform={`rotate(90 ${x + width + 0.35} ${y + 0.2})`}>
            {label}
          </text>
        ))}
    </g>
  )
}

function Forklift({ place }: { place: Place }) {
  const { x, y, width, depth } = place
  return (
    <g>
      <rect x={x + 0.1} y={y + 0.1} width={width} height={depth} fill={ink.shadow} rx="0.15" />
      <rect x={x} y={y + depth * 0.3} width={width} height={depth * 0.7} fill={ink.forklift} stroke={ink.line} strokeWidth="0.04" rx="0.15" />
      <rect x={x + width * 0.2} y={y + depth * 0.45} width={width * 0.6} height={depth * 0.3} fill={ink.navy} rx="0.08" />
      <line x1={x + width * 0.25} y1={y} x2={x + width * 0.25} y2={y + depth * 0.3} stroke={ink.line} strokeWidth="0.08" />
      <line x1={x + width * 0.75} y1={y} x2={x + width * 0.75} y2={y + depth * 0.3} stroke={ink.line} strokeWidth="0.08" />
    </g>
  )
}

/** A machine from above: its body, a dark blue roof strip, a window, its control cabinet and its name. */
function MachineShape({ station, marked }: { station: Station; marked: boolean }) {
  const { machine, state, running, program, place } = station
  const { x, y, width, depth } = place
  const alarm = state === "alarm"
  const edge = alarm ? ink.alarm : running ? ink.bodyEdge : ink.attention
  return (
    <g className={running && !marked ? "opacity-45 grayscale" : undefined}>
      {marked && (
        <rect x={x - 0.9} y={y - 0.9} width={width + 1.8} height={depth + 1.8} rx="0.7" fill="none" stroke="var(--primary)" strokeWidth="0.16" strokeDasharray="0.7 0.35" />
      )}
      <title>{`${labelOf(machine)}: ${stateLabel[state]}${program ? ` · ${program}` : ""}`}</title>
      {!running && (
        <rect
          x={x - 0.6}
          y={y - 0.6}
          width={width + 1.2}
          height={depth + 1.2}
          rx="0.5"
          fill="none"
          stroke={edge}
          strokeWidth="0.18"
          className="motion-safe:animate-pulse"
        />
      )}
      <rect x={x + 0.25} y={y + 0.25} width={width} height={depth} fill={ink.shadow} rx="0.25" />
      <rect x={x} y={y} width={width} height={depth} rx="0.25" fill={alarm ? ink.alarmTint : ink.body} stroke={edge} strokeWidth="0.1" />
      {/* The dark blue strip on top carries the name, like a plate on the machine. */}
      <rect x={x + 0.35} y={y + 0.35} width={width - 0.7} height={STRIP} rx="0.12" fill={ink.navy} />
      <text x={x + width / 2} y={y + 0.35 + STRIP / 2 + TEXT * 0.45} textAnchor="middle" fontSize={TEXT * 1.25} fontWeight="600" fill="white" letterSpacing="0.05">
        {serialOf(machine)}
      </text>
      <rect x={x + width * 0.15} y={y + depth * 0.42} width={width * 0.52} height={depth * 0.3} rx="0.1" fill={ink.glass} opacity="0.55" stroke={ink.bodyEdge} strokeWidth="0.04" />
      <rect x={x + width - 1.1} y={y + depth * 0.4} width="0.7" height={depth * 0.45} rx="0.08" fill={ink.navy} opacity="0.85" />
    </g>
  )
}

/** Over a machine that does not run: why, on a sign that points at it. */
function Callout({ place, text, state }: { place: Place; text: string; state: Station["state"] }) {
  const size = TEXT * 1.05
  const width = Math.min(widthOf(text, size) + 1, 22)
  const centre = place.x + place.width / 2
  const left = Math.max(0, centre - width / 2)
  const bottom = place.y - 0.9
  const height = size + 0.7
  const fill = state === "alarm" ? ink.alarm : ink.attention
  return (
    <g className="motion-safe:animate-pulse">
      <rect x={left} y={bottom - height} width={width} height={height} rx="0.3" fill={fill} />
      <path d={`M ${centre - 0.4} ${bottom} L ${centre} ${bottom + 0.6} L ${centre + 0.4} ${bottom} Z`} fill={fill} />
      <text x={left + width / 2} y={bottom - height / 2 + size * 0.36} textAnchor="middle" fontSize={size} fontWeight="600" fill="white">
        {text}
      </text>
    </g>
  )
}
