import { useEffect, useRef } from "react"

import type { VoiceState } from "@/showcases/titan/voice/voice.ts"

// The face of the assistant: a cloud of glowing points that turns slowly in the dark.
//
// - It breathes while it waits.
// - It draws together and shimmers while it listens.
// - It swirls while it thinks.
// - Waves run through it while it speaks.
// - It turns red while a machine has an open error.
//
// Drawn on a canvas: a cloud of points is no component of the design system. The colours are the
// tokens of the design system, `--primary` and `--state-alarm`, read from the page.

/** How many points the cloud has. */
const POINTS = 1400

/** How the cloud moves in each state; the cloud glides from one to the next. */
type Motion = {
  /** Radians per second around the upright axis. */
  spin: number
  /** Share of the radius the cloud takes. */
  size: number
  /** How far a point drifts from its place, as a share of the radius. */
  drift: number
  /** How fast it drifts. */
  pace: number
  /** Height of the waves that run outwards from the middle. */
  wave: number
  /** How strongly the cloud twists around its axis. */
  swirl: number
  /** How bright the points are. */
  light: number
}

const motions: Record<VoiceState, Motion> = {
  idle: { spin: 0.12, size: 1, drift: 0.05, pace: 0.6, wave: 0, swirl: 0, light: 0.75 },
  listening: { spin: 0.2, size: 0.82, drift: 0.09, pace: 3.2, wave: 0, swirl: 0, light: 1 },
  thinking: { spin: 0.9, size: 0.92, drift: 0.04, pace: 1.2, wave: 0, swirl: 1.4, light: 0.9 },
  speaking: { spin: 0.25, size: 1.05, drift: 0.04, pace: 1, wave: 0.14, swirl: 0, light: 1 },
}

type Point = { x: number; y: number; z: number; depth: number; phase: number; twinkle: number }

function scatter(): Point[] {
  return Array.from({ length: POINTS }, () => {
    // An even direction on the sphere, and a distance from the middle that thins out towards the edge.
    const y = Math.random() * 2 - 1
    const around = Math.random() * Math.PI * 2
    const flat = Math.sqrt(1 - y * y)
    return {
      x: flat * Math.cos(around),
      y,
      z: flat * Math.sin(around),
      // Most points gather in the cloud; a few stray far out, so that its edge stays open.
      depth: Math.random() < 0.06 ? 1.05 + Math.random() * 0.5 : 0.2 + 0.8 * Math.sqrt(Math.random()),
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.5 + Math.random() * 1.5,
    }
  })
}

const glide = (from: number, to: number, share: number) => from + (to - from) * share

/** `className` sets the size; the cloud fills a square. */
export function Cloud({ state, alarm, className = "size-72" }: { state: VoiceState; alarm: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // The loop reads the newest state without starting again.
  const target = useRef({ state, alarm })
  target.current = { state, alarm }

  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext("2d")
    if (!element || !context) return

    const points = scatter()
    const style = getComputedStyle(element)
    const tokens = {
      calm: style.getPropertyValue("--primary").trim() || "oklch(0.6 0.15 250)",
      alarm: style.getPropertyValue("--state-alarm").trim() || "oklch(0.6 0.2 25)",
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)")

    const now: Motion ={ ...motions[target.current.state] }
    let red = target.current.alarm ? 1 : 0
    let turn = 0
    let time = 0
    let last = performance.now()
    let frame = 0

    const draw = (at: number) => {
      const step = Math.min((at - last) / 1000, 0.1)
      last = at

      const wanted = motions[target.current.state]
      const share = 1 - Math.exp(-step * 3)
      for (const key of Object.keys(now) as (keyof Motion)[]) now[key] = glide(now[key], wanted[key], share)
      red = glide(red, target.current.alarm ? 1 : 0, share)
      if (!still.matches) {
        time += step
        turn += step * now.spin
      }

      const ratio = window.devicePixelRatio || 1
      const side = element.clientWidth
      if (element.width !== side * ratio) {
        element.width = side * ratio
        element.height = side * ratio
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, side, side)
      context.globalCompositeOperation = "lighter"

      const middle = side / 2
      const radius = side * 0.34 * now.size * (1 + 0.03 * Math.sin(time * 0.8))
      const tilt = 0.35
      const [cosTilt, sinTilt] = [Math.cos(tilt), Math.sin(tilt)]

      // The cloud mixes from blue to red, point by point, so that the alarm spreads through it.
      for (let index = 0; index < points.length; index++) {
        const point = points[index]
        const reach =
          point.depth *
          (1 +
            now.drift * Math.sin(point.phase + time * now.pace * point.twinkle) +
            now.wave * Math.sin(time * 7 - point.depth * 9))
        // Turn around the upright axis, the inner points faster while it swirls.
        const angle = turn + now.swirl * (1 - point.depth) * time
        const [cos, sin] = [Math.cos(angle), Math.sin(angle)]
        const x = (point.x * cos - point.z * sin) * reach
        const z0 = (point.x * sin + point.z * cos) * reach
        const y = (point.y * cosTilt - z0 * sinTilt) * reach
        const z = point.y * sinTilt + z0 * cosTilt

        // Near points are bigger and brighter than far ones.
        const near = (z + 1.2) / 2.4
        const flicker = 0.6 + 0.4 * Math.sin(point.phase * 3 + time * point.twinkle * 2)
        context.globalAlpha = Math.max(0, Math.min(1, now.light * (0.25 + near) * flicker * 1.3))
        // Every seventh point is white, so that the cloud sparkles.
        context.fillStyle = index % 7 === 0 ? "white" : (index % 100) / 100 < red ? tokens.alarm : tokens.calm
        const dot = 0.7 + near * 2
        context.beginPath()
        context.arc(middle + x * radius, middle + y * radius, dot, 0, Math.PI * 2)
        context.fill()
      }

      // A faint haze in the middle, so that the cloud seems to glow from inside.
      context.globalAlpha = 0.3 * now.light
      const haze = context.createRadialGradient(middle, middle, 0, middle, middle, radius * 1.1)
      haze.addColorStop(0, red > 0.5 ? tokens.alarm : tokens.calm)
      haze.addColorStop(1, "transparent")
      context.fillStyle = haze
      context.fillRect(0, 0, side, side)

      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={canvas} aria-hidden className={className} />
}
