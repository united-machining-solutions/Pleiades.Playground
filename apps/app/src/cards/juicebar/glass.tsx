import { useId } from "react"

import type { Glass as Shape } from "./results.ts"

// The glass of the drink card, drawn in the shape its author chose (results.ts, glassOf), filled with
// the colour of the drink. Small in a row of the list; large after an order, where the juice runs from
// the outlet, rises with the progress and, when the glass is full, an umbrella springs in. The motion
// lies in glass.css and stops for a person who asked for less motion.

/** A shape in the coordinates of the large glass: 120 wide, the foot at 146. */
type Outline = {
  /** The bowl: drawn as the outline, and the space the juice fills. */
  bowl: string
  /** Stem and foot of a glass with a stem. */
  stem?: string
  straw?: string
  shine: string
  /** Where the juice ends at the bottom, where it stands when the glass is full, and the rim. */
  bottom: number
  full: number
  rim: number
  /** The foot of the umbrella's stick in the juice, and its canopy above the rim. */
  stick: [number, number]
  canopy: [number, number]
}

const highball: Outline = {
  bowl: "M28 24 H92 L88.4 139 Q88 146 81 146 H39 Q32 146 31.6 139 Z",
  shine: "M36 36 L39.5 128",
  bottom: 146,
  full: 34,
  rim: 24,
  stick: [72, 104],
  canopy: [97, 9],
}

const outlines: Record<Shape, Outline> = {
  highball,
  straw: { ...highball, straw: "M52 140 L38 0" },
  hurricane: {
    bowl: "M30 18 C28 48 46 60 44 78 C42 94 33 100 35 113 C37 126 50 132 57 132 H63 C70 132 83 126 85 113 C87 100 78 94 76 78 C74 60 92 48 90 18 Z",
    stem: "M60 132 V145 M43 146.5 H77",
    shine: "M39 30 C38 46 49 60 49 74",
    bottom: 132,
    full: 28,
    rim: 18,
    stick: [68, 104],
    canopy: [96, 4],
  },
  martini: {
    bowl: "M14 30 H106 L62 84 Q60 86.5 58 84 Z",
    stem: "M60 85 V145 M42 146.5 H78",
    shine: "M27 36 L46 58",
    bottom: 86,
    full: 38,
    rim: 30,
    stick: [66, 72],
    canopy: [103, 13],
  },
  margarita: {
    bowl: "M12 34 C12 52 28 58 42 58 C40 74 48 86 60 86 C72 86 80 74 78 58 C92 58 108 52 108 34 Z",
    stem: "M60 86 V145 M42 146.5 H78",
    shine: "M22 40 C24 48 30 52 38 53",
    bottom: 86,
    full: 40,
    rim: 34,
    stick: [66, 76],
    canopy: [104, 16],
  },
}

/** The canopy of the umbrella, upright at the top of its stick, twice the size of the drawing below. */
function canopyAt({ stick, canopy }: Outline): string {
  const angle = Math.round((Math.atan2(canopy[0] - stick[0], stick[1] - canopy[1]) * 180) / Math.PI)
  return `translate(${canopy[0]} ${canopy[1]}) rotate(${angle}) scale(2)`
}

/** The paper umbrella: the stick behind the juice, the canopy in front of the glass. */
const umbrellaColour = "#e11d74"
const wood = "#8a6a3d"

function Canopy({ outline, thin }: { outline: Outline; thin: boolean }) {
  return (
    <g transform={canopyAt(outline)}>
      <path
        d="M-11 0 A11 11 0 0 1 11 0 Q8.25 2.6 5.5 0 Q2.75 2.6 0 0 Q-2.75 2.6 -5.5 0 Q-8.25 2.6 -11 0 Z"
        fill={umbrellaColour}
        stroke="currentColor"
        strokeWidth={thin ? 1.2 : 0.8}
        strokeLinejoin="round"
        vectorEffect={thin ? "non-scaling-stroke" : undefined}
      />
      <path
        d="M0 -11 L-5.5 0 M0 -11 L0 0 M0 -11 L5.5 0"
        fill="none"
        stroke="#ffffff"
        strokeOpacity={0.75}
        strokeWidth={thin ? 1 : 0.6}
        vectorEffect={thin ? "non-scaling-stroke" : undefined}
      />
    </g>
  )
}

/** A unique id for the clip path of one glass, usable in `url(#...)`. */
function useClipId(): string {
  return `juice-glass-${useId().replace(/[^\w-]/g, "")}`
}

/** A glass in a row of the list: still, three quarters full, with an umbrella when the drink is picked. */
export function SmallGlass({ shape, colour, fizzy, umbrella }: { shape: Shape; colour?: string; fizzy: boolean; umbrella: boolean }) {
  const outline = outlines[shape]
  const clip = useClipId()
  const level = outline.bottom - (outline.bottom - outline.full) * 0.72
  const middle = (outline.bottom + outline.full) / 2
  const shown = { opacity: umbrella ? 1 : 0, transform: umbrella ? "none" : "translate(-8px, 24px) rotate(-35deg) scale(0.15)" }
  const origin = `${outline.stick[0]}px ${outline.stick[1]}px`
  return (
    <svg width="38" height="48" viewBox="0 -2 120 152" aria-hidden="true" className="shrink-0 overflow-visible">
      <defs>
        <clipPath id={clip}>
          <path d={outline.bowl} />
        </clipPath>
      </defs>
      {outline.straw && <path d={outline.straw} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      <g className="juice-umbrella" style={{ ...shown, transformOrigin: origin }}>
        <line x1={outline.stick[0]} y1={outline.stick[1]} x2={outline.canopy[0]} y2={outline.canopy[1]} stroke={wood} strokeWidth={1.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </g>
      <g clipPath={`url(#${clip})`}>
        <rect x={0} y={level} width={120} height={160} fill={colour ?? "var(--muted)"} />
        {fizzy && (
          <g fill="#ffffff" stroke="currentColor" strokeOpacity={0.3} strokeWidth={0.6} vectorEffect="non-scaling-stroke">
            <circle cx={48} cy={middle + 6} r={5} />
            <circle cx={66} cy={middle - 6} r={4} />
            <circle cx={58} cy={outline.bottom - 10} r={4.5} />
          </g>
        )}
      </g>
      <path d={outline.bowl} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {outline.stem && <path d={outline.stem} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      <g className="juice-umbrella" style={{ ...shown, transformOrigin: origin }}>
        <Canopy outline={outline} thin />
      </g>
    </svg>
  )
}

/** Where an order stands, as the large glass draws it. */
export type Pour = "waiting" | "pouring" | "full"

/**
 * The glass of an order. While it waits for the start button it wobbles under the outlet; while the
 * pumps run, the juice runs from the outlet and rises with the progress; when it is full, the last of
 * the stream falls in, the umbrella springs in and a burst in the colours of the ingredients goes off.
 */
export function PouringGlass({
  shape,
  colour,
  fizzy,
  pour,
  progress,
  confetti,
}: {
  shape: Shape
  colour?: string
  fizzy: boolean
  pour: Pour
  /** From 0 to 1. */
  progress: number
  confetti: ReadonlyArray<string>
}) {
  const outline = outlines[shape]
  const clip = useClipId()
  const filled = pour === "full" ? 1 : pour === "pouring" ? Math.min(Math.max(progress, 0), 1) : 0
  const level = outline.bottom + 6 - filled * (outline.bottom + 6 - outline.full)
  const juice = colour ?? "var(--muted-foreground)"
  const stream =
    pour === "pouring" ? "translateY(0px) scaleY(1)" : pour === "full" ? `translateY(${outline.bottom - 20}px) scaleY(0)` : "translateY(0px) scaleY(0)"
  const dots = burstDots.map((dot, index) => ({ ...dot, fill: confetti[index % Math.max(confetti.length, 1)] ?? umbrellaColour }))
  const origin = `${outline.stick[0]}px ${outline.stick[1]}px`
  return (
    <div className="juice-drop">
      <div className={pour === "waiting" ? "juice-wobble" : undefined}>
        <svg width="150" height="203" viewBox="0 -12 120 162" aria-hidden="true" className="block overflow-visible">
          <defs>
            <clipPath id={clip}>
              <path d={outline.bowl} />
            </clipPath>
          </defs>
          <g className="juice-stream" style={{ transform: stream, transformOrigin: "60px 7px" }}>
            <path d={`M57.6 7 H62.4 L61.7 ${outline.bottom} H58.3 Z`} fill={juice} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.6} />
            <line className="juice-shimmer" x1={59.3} y1={8} x2={59.3} y2={outline.bottom} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="5 18" />
          </g>
          <Outlet />
          {outline.straw && <path d={outline.straw} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />}
          {pour === "full" && (
            <g className="juice-spring" style={{ transformOrigin: origin }}>
              <line x1={outline.stick[0]} y1={outline.stick[1]} x2={outline.canopy[0]} y2={outline.canopy[1]} stroke={wood} strokeWidth={3} strokeLinecap="round" />
            </g>
          )}
          <g clipPath={`url(#${clip})`}>
            <g className="juice-level" style={{ transform: `translateY(${level}px)` }}>
              <path
                className="juice-wave"
                d="M-120 0 Q-105 -5 -90 0 T-60 0 T-30 0 T0 0 T30 0 T60 0 T90 0 T120 0 T150 0 T180 0 T210 0 T240 0 V160 H-120 Z"
                fill={juice}
              />
              {fizzy && pour !== "waiting" && <Bubbles />}
              {pour === "pouring" && filled > 0.02 && <Splash juice={juice} />}
            </g>
          </g>
          <path d={outline.shine} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" />
          <path d={outline.bowl} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" />
          {outline.stem && <path d={outline.stem} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />}
          {pour === "full" && (
            <>
              <g transform={`translate(0 ${outline.rim - 36})`}>
                <g className="juice-burst" style={{ transformOrigin: "60px 36px" }}>
                  {dots.map((dot) => (
                    <circle key={`${dot.cx} ${dot.cy}`} cx={dot.cx} cy={dot.cy} r={dot.r} fill={dot.fill} />
                  ))}
                </g>
              </g>
              <g className="juice-spring" style={{ transformOrigin: origin }}>
                <Canopy outline={outline} thin={false} />
              </g>
            </>
          )}
        </svg>
      </div>
    </div>
  )
}

/** The outlet of the machine, pale: the glass is what matters. */
function Outlet() {
  return (
    <g fill="var(--muted)">
      <rect x={38} y={-14} width={44} height={8} rx={3} />
      <path d="M51.5 -6 H68.5 L65.5 5 H54.5 Z" />
      <rect x={53.5} y={3.5} width={13} height={3.5} rx={1.75} fill="var(--border)" />
    </g>
  )
}

function Bubbles() {
  const bubbles = [
    { cx: 44, cy: 30, r: 2.6, delay: "0s" },
    { cx: 56, cy: 18, r: 2, delay: "0.5s" },
    { cx: 70, cy: 26, r: 2.8, delay: "0.9s" },
    { cx: 80, cy: 12, r: 2.2, delay: "1.3s" },
    { cx: 50, cy: 40, r: 1.8, delay: "1.6s" },
  ]
  return (
    <g fill="#ffffff" fillOpacity={0.85}>
      {bubbles.map((bubble) => (
        <circle key={bubble.cx} className="juice-rise" cx={bubble.cx} cy={bubble.cy} r={bubble.r} style={{ animationDelay: bubble.delay }} />
      ))}
    </g>
  )
}

/** Where the stream meets the juice: a ring and three drops. */
function Splash({ juice }: { juice: string }) {
  const drops = [
    { cx: 54.5, cy: -2, r: 1.4, delay: "0s" },
    { cx: 65.5, cy: -3, r: 1.2, delay: "0.17s" },
    { cx: 61.5, cy: -5.5, r: 0.9, delay: "0.34s" },
  ]
  return (
    <g>
      <ellipse className="juice-ripple" cx={60} cy={1} rx={7} ry={1.8} fill="none" stroke="#ffffff" strokeOpacity={0.8} strokeWidth={1} style={{ transformOrigin: "60px 1px" }} />
      {drops.map((drop) => (
        <circle key={drop.cx} className="juice-hop" cx={drop.cx} cy={drop.cy} r={drop.r} fill={juice} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} style={{ animationDelay: drop.delay }} />
      ))}
    </g>
  )
}

/** The burst over a full glass: twelve dots around the middle of the rim, flying out from it. */
const burstDots = [
  { cx: 4.8, cy: 26.3, r: 3 },
  { cx: 21.9, cy: 14, r: 2.5 },
  { cx: 24, cy: -6.9, r: 3 },
  { cx: 45, cy: -5.3, r: 2.5 },
  { cx: 60, cy: -22, r: 3 },
  { cx: 75, cy: -5.3, r: 2.5 },
  { cx: 96, cy: -6.9, r: 3 },
  { cx: 98.1, cy: 14, r: 2.5 },
  { cx: 115.2, cy: 26.3, r: 3 },
  { cx: 31.8, cy: 25.7, r: 2 },
  { cx: 88.2, cy: 25.7, r: 2 },
  { cx: 60, cy: 6, r: 2 },
]
