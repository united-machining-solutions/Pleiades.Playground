import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber"
import { Component, Suspense, useEffect, useRef } from "react"
import type { ReactNode } from "react"
import { PMREMGenerator } from "three"
import type { Object3D } from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

import type { Pose, Sample } from "./axes.ts"
import { Track } from "./motion.ts"

/** The model comes through the server of the app, see `routes/api/osaca-model.ts`. */
export const MODEL_URL = "/api/osaca-model"

/** The rail of the robot is drawn longer than it is: the factor of the HMI of the cell. */
const RAIL_SCALE = 1.128333

/** The nodes of the model that move, by their names in the file; the same as in the HMI of the cell. */
const JOINTS = ["A1001", "A2001", "A3001", "A4001", "A5001", "A6001"] as const

type Nodes = { joints: Array<Object3D | null>; x: Object3D | null; y: Object3D | null; z: Object3D | null; rail: Object3D | null }

/**
 * The cell in 3D. It only shows: the pose comes from the values of the cell, a person turns and zooms the view.
 * `onProgress` reports the download of the model, from 0 to 1.
 */
export function OsacaScene({ pose, onProgress, onError }: { pose: Pose; onProgress: (part: number) => void; onError: (reason: string) => void }) {
  return (
    <ModelBoundary onError={onError}>
      <Canvas camera={{ position: [2, 3, 0], fov: 50, near: 0.05, far: 100 }} gl={{ antialias: true, alpha: true }}>
        <Surroundings />
        <hemisphereLight args={["#ffffff", "#8a8f99", 0.6]} />
        <directionalLight position={[2, 3, -1]} intensity={1.2} />
        <directionalLight position={[-2, 2, 2]} intensity={0.4} />
        <Suspense fallback={null}>
          <Model pose={pose} onProgress={onProgress} />
        </Suspense>
        <Controls />
      </Canvas>
    </ModelBoundary>
  )
}

function Model({ pose, onProgress }: { pose: Pose; onProgress: (part: number) => void }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL, undefined, (event) => {
    if (event.total > 0) onProgress(event.loaded / event.total)
  })
  const nodes = useRef<Nodes | null>(null)
  const target = useRef(pose)
  target.current = pose
  // One track per axis: six joints, then X, Y, Z and the rail.
  const tracks = useRef(Array.from({ length: 10 }, () => new Track()))

  useEffect(() => {
    onProgress(1)
    const scene = gltf.scene
    const named = (name: string) => scene.getObjectByName(name) ?? null
    nodes.current = {
      joints: JOINTS.map(named),
      x: named("X_Achse"),
      y: named("Y_Achse"),
      z: named("Z_Achse"),
      rail: named("X7_Tisch"),
    }
  }, [gltf, onProgress])

  useFrame(() => {
    const found = nodes.current
    if (!found) return
    const now = performance.now()
    const { joints, x, y, z, rail } = target.current
    // Where each axis is drawn now, moving between the positions of the cell; null until the first came.
    const drawn = [...joints, x, y, z, rail].map((sample: Sample | null, i) => {
      const track = tracks.current[i]!
      if (sample) track.push(sample, now)
      return track.at(now)
    })
    found.joints.forEach((node, i) => {
      const angle = drawn[i]
      // The last joint turns the other way round in the model.
      if (node && angle !== null && angle !== undefined) node.rotation.y = i === 5 ? -angle : angle
    })
    const [toX, toY, toZ, toRail] = drawn.slice(6)
    if (found.x && toX != null) found.x.position.x = toX
    if (found.y && toY != null) found.y.position.z = toY
    if (found.z && toZ != null) found.z.position.y = toZ
    if (found.rail && toRail != null) found.rail.position.x = toRail * RAIL_SCALE
  })

  return <primitive object={gltf.scene} />
}

/**
 * What the surfaces of the model reflect. A metal reflects its surroundings and has no colour of its own: without
 * surroundings the metal parts of the cell, its frame among them, would be drawn black. A neutral room, made in
 * the browser, needs no file to download.
 */
function Surroundings() {
  const renderer = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  useEffect(() => {
    const generator = new PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    const environment = generator.fromScene(room, 0.04).texture
    scene.environment = environment
    room.dispose()
    return () => {
      scene.environment = null
      environment.dispose()
      generator.dispose()
    }
  }, [renderer, scene])
  return null
}

/** Turn, zoom and move the view with the mouse, around the middle of the cell. */
function Controls() {
  const camera = useThree((state) => state.camera)
  const element = useThree((state) => state.gl.domElement)
  const controls = useRef<OrbitControls | null>(null)
  useEffect(() => {
    const orbit = new OrbitControls(camera, element)
    orbit.target.set(0, 1, 0)
    orbit.enableDamping = true
    orbit.update()
    controls.current = orbit
    return () => orbit.dispose()
  }, [camera, element])
  useFrame(() => controls.current?.update())
  return null
}

/** A model that cannot be loaded says why, instead of taking the page with it. */
class ModelBoundary extends Component<{ onError: (reason: string) => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch(error: unknown) {
    this.props.onError(String(error instanceof Error ? error.message : error))
  }
  override render() {
    return this.state.failed ? null : this.props.children
  }
}
