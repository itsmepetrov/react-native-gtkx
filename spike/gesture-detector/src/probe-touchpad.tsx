// PROBE 6: a real touchpad pinch, injected, all the way into GTK.
//
// Probe 4 recorded that GTK routes `GDK_TOUCHPAD_PINCH` straight into
// `GtkGestureZoom` as a first-class scale delta, and that nothing in the rig
// could produce one — `zwlr_virtual_pointer_v1` has no gesture requests and
// the VM had no touchpad. That was a harness gap, not a platform one, and
// this probe closes it: a virtual multitouch touchpad on `/dev/uinput`
// (`tests/gtk/support/virtual-touchpad.ts`) is a device libinput classifies
// and runs its own pinch detection over, so the whole chain becomes real.
//
//   uinput -> evdev -> libinput -> compositor -> GDK -> GtkGestureZoom
//
// THE ONE CONSTRAINT, and it is why this probe has its own runner: the
// compositor in that chain has to have a libinput backend. The headless sway
// `run-headless.sh` starts — and the one `@gtkx/vitest` starts per worker —
// is launched with `WLR_BACKENDS=headless` and `WLR_LIBINPUT_NO_DEVICES=1`,
// so it enumerates no input devices at all and a uinput touchpad is invisible
// to it. `run-session.sh` runs this against the desktop session's real
// compositor, which is the only one here that has one.
//
// A: raw GTK, no React Native in the path — `Gtk.GestureZoom` and
//    `Gtk.GestureRotate` on a plain `GtkBox`, which is the decisive question
//    and the one that had to be answered before anything was built on it.
// B: the shipped module — `Gesture.Pinch()` and `Gesture.Rotation()` inside a
//    real `GestureDetector`, driven by the same injected gesture.
//
// The negative control is a zone the pointer never visits. A touchpad pinch
// is delivered to the surface under the POINTER, so "something fired" is not
// evidence on its own; the control has to stay at zero in every run.
import { useLayoutEffect, useRef } from "react"
import { AppRegistry, View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gtkx/gesture-handler"
import { Gtk, GtkBox } from "react-native-gtkx/gtk"
import {
  createVirtualTouchpad,
  VirtualTouchpadUnavailable,
  type VirtualTouchpad,
} from "../../../packages/react-native-gtkx/tests/gtk/support/virtual-touchpad"
import { check, finish, fullscreen, log, rectOf, sleep } from "./harness"

const M = "gd-touchpad"

type Tape = {
  name: string
  zoomBegin: number
  zoomEnd: number
  scales: number[]
  rotateBegin: number
  angles: number[]
  /** Where GTK said the gesture was, in widget coordinates. */
  centres: { x: number; y: number }[]
}

const newTape = (name: string): Tape => ({
  name,
  zoomBegin: 0,
  zoomEnd: 0,
  scales: [],
  rotateBegin: 0,
  angles: [],
  centres: [],
})

const reset = (tape: Tape): void => {
  tape.zoomBegin = 0
  tape.zoomEnd = 0
  tape.scales = []
  tape.rotateBegin = 0
  tape.angles = []
  tape.centres = []
}

const last = (values: number[]): number | null =>
  values.length === 0 ? null : values[values.length - 1]!

/** Attaches GTK's two touchpad gestures and records everything they report. */
const instrument = (widget: Gtk.Widget, tape: Tape): void => {
  const zoom = new Gtk.GestureZoom()
  zoom.on("begin", () => {
    tape.zoomBegin += 1
    const [ok, x, y] = zoom.getBoundingBoxCenter()
    if (ok) {
      tape.centres.push({ x, y })
    }
  })
  zoom.on("scale-changed", (scale: number) => {
    tape.scales.push(scale)
  })
  zoom.on("end", () => {
    tape.zoomEnd += 1
  })
  widget.addController(zoom)

  const rotate = new Gtk.GestureRotate()
  rotate.on("begin", () => {
    tape.rotateBegin += 1
  })
  rotate.on("angle-changed", (_angle: number, delta: number) => {
    tape.angles.push(delta)
  })
  widget.addController(rotate)
}

type ModuleTape = {
  name: string
  begin: number
  start: number
  updates: number
  end: number
  scale: number | null
  velocity: number | null
  rotation: number | null
  focal: { x: number; y: number } | null
}

const newModuleTape = (name: string): ModuleTape => ({
  name,
  begin: 0,
  start: 0,
  updates: 0,
  end: 0,
  scale: null,
  velocity: null,
  rotation: null,
  focal: null,
})

const resetModule = (tape: ModuleTape): void => {
  tape.begin = 0
  tape.start = 0
  tape.updates = 0
  tape.end = 0
}

const Probe = (): React.ReactNode => {
  const targetRef = useRef<Gtk.Widget | null>(null)
  const controlRef = useRef<Gtk.Widget | null>(null)

  const rawTarget = useRef(newTape("raw-target")).current
  const rawControl = useRef(newTape("raw-control")).current
  const pinchTape = useRef(newModuleTape("pinch")).current
  const rotationTape = useRef(newModuleTape("rotation")).current
  const controlPinchTape = useRef(newModuleTape("control-pinch")).current

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      pinchTape.begin += 1
    })
    .onStart(() => {
      pinchTape.start += 1
    })
    .onUpdate((event) => {
      pinchTape.updates += 1
      pinchTape.scale = event.scale
      pinchTape.velocity = event.velocity
      pinchTape.focal = { x: event.focalX, y: event.focalY }
    })
    .onEnd(() => {
      pinchTape.end += 1
    })

  const rotation = Gesture.Rotation()
    .onBegin(() => {
      rotationTape.begin += 1
    })
    .onStart(() => {
      rotationTape.start += 1
    })
    .onUpdate((event) => {
      rotationTape.updates += 1
      rotationTape.rotation = event.rotation
      rotationTape.velocity = event.velocity
      rotationTape.focal = { x: event.anchorX, y: event.anchorY }
    })
    .onEnd(() => {
      rotationTape.end += 1
    })

  const controlPinch = Gesture.Pinch()
    .onBegin(() => {
      controlPinchTape.begin += 1
    })
    .onUpdate(() => {
      controlPinchTape.updates += 1
    })

  useLayoutEffect(() => {
    const target = targetRef.current
    const control = controlRef.current
    if (!target || !control) {
      return
    }
    instrument(target, rawTarget)
    instrument(control, rawControl)

    let pad: VirtualTouchpad | null = null
    const run = async (): Promise<void> => {
      await fullscreen(M, target)
      try {
        pad = await createVirtualTouchpad()
      } catch (error) {
        if (error instanceof VirtualTouchpadUnavailable) {
          log(M, `SKIP no virtual touchpad: ${error.message}`)
          finish(M)
          process.exit(process.exitCode ?? 0)
        }
        throw error
      }

      const targetRect = rectOf(target)
      const controlRect = rectOf(control)
      log(
        M,
        `target=${JSON.stringify(targetRect)} control=${JSON.stringify(controlRect)}`,
      )

      // A touchpad has no absolute addressing, so the pointer is AIMED, not
      // placed: glide hard into the top-left (the compositor clamps, so that
      // lands exactly whatever pointer acceleration did on the way), then
      // walk out from there into the target half.
      for (let i = 0; i < 4; i += 1) {
        await pad.glideBy(-120, -80)
      }
      await pad.glideBy(30, 8)
      await sleep(200)

      // --- A: raw GTK -----------------------------------------------------
      reset(rawTarget)
      reset(rawControl)
      await pad.pinchBy(2)
      await sleep(200)
      const spreadScale = last(rawTarget.scales)
      const spreadCentre = rawTarget.centres[0] ?? null

      reset(rawTarget)
      await pad.pinchBy(0.5)
      await sleep(200)
      const squeezeScale = last(rawTarget.scales)

      reset(rawTarget)
      await pad.rotateBy(60)
      await sleep(200)
      const angle = last(rawTarget.angles)
      const scaleDuringRotate = last(rawTarget.scales)

      check(
        M,
        "an injected two-finger spread reaches GtkGestureZoom",
        spreadScale !== null && spreadScale > 1.5,
        `scale-changed reported ${spreadScale} for a 2.0x spread (${rawTarget.scales.length} events)`,
      )
      check(
        M,
        "an injected pinch-in reaches it as a scale BELOW 1",
        squeezeScale !== null && squeezeScale < 0.7,
        `scale-changed reported ${squeezeScale} for a 0.5x squeeze`,
      )
      check(
        M,
        "an injected two-finger rotation reaches GtkGestureRotate",
        angle !== null && Math.abs(angle) > 0.6,
        `angle-changed reported ${angle} rad (${angle === null ? "-" : ((angle * 180) / Math.PI).toFixed(1)} deg) for a 60 deg rotation`,
      )
      check(
        M,
        "a rotation is not also a zoom",
        scaleDuringRotate !== null && Math.abs(scaleDuringRotate - 1) < 0.1,
        `scale during the rotation stayed at ${scaleDuringRotate}`,
      )
      log(
        M,
        `bounding box centre at pinch begin = ${JSON.stringify(spreadCentre)}`,
      )
      check(
        M,
        "NEGATIVE CONTROL: the zone the pointer never visited saw nothing",
        rawControl.zoomBegin === 0 && rawControl.rotateBegin === 0,
        `control zoom begins=${rawControl.zoomBegin} rotate begins=${rawControl.rotateBegin} scale events=${rawControl.scales.length}`,
      )

      // --- B: the shipped module -----------------------------------------
      //
      // Part A's injections reached these detectors too — they are on the same
      // widgets, which is the point — so the counters start from what that
      // left behind.
      resetModule(pinchTape)
      resetModule(rotationTape)
      resetModule(controlPinchTape)
      reset(rawTarget)
      await pad.pinchBy(2)
      await sleep(250)
      check(
        M,
        "Gesture.Pinch() ran the full BEGAN -> ACTIVE -> END progression",
        pinchTape.begin === 1 &&
          pinchTape.start === 1 &&
          pinchTape.updates > 3 &&
          pinchTape.end === 1,
        `begin=${pinchTape.begin} start=${pinchTape.start} updates=${pinchTape.updates} end=${pinchTape.end}`,
      )
      check(
        M,
        "its `scale` is upstream's — cumulative, and above 1 for a spread",
        pinchTape.scale !== null && pinchTape.scale > 1.5,
        `scale=${pinchTape.scale} velocity=${pinchTape.velocity} focal=${JSON.stringify(pinchTape.focal)}`,
      )
      // The strongest single check in the file: the same injected gesture was
      // watched by a raw GtkGestureZoom and by `Gesture.Pinch()`, and the
      // number the module reports has to BE the number GTK reported. Anything
      // re-derived on the way through would show up here.
      const rawScale = last(rawTarget.scales)
      check(
        M,
        "the module's `scale` is GTK's own number, not a re-derivation",
        rawScale !== null &&
          pinchTape.scale !== null &&
          Math.abs(rawScale - pinchTape.scale) < 1e-9,
        `raw GtkGestureZoom=${rawScale} Gesture.Pinch()=${pinchTape.scale}`,
      )

      await pad.rotateBy(60)
      await sleep(250)
      check(
        M,
        "Gesture.Rotation() reports radians, clockwise-positive",
        rotationTape.rotation !== null && rotationTape.rotation > 0.6,
        `rotation=${rotationTape.rotation} rad velocity=${rotationTape.velocity} anchor=${JSON.stringify(rotationTape.focal)} updates=${rotationTape.updates}`,
      )
      check(
        M,
        "NEGATIVE CONTROL: the detector the pointer never visited never began",
        controlPinchTape.begin === 0 && controlPinchTape.updates === 0,
        `control begin=${controlPinchTape.begin} updates=${controlPinchTape.updates}`,
      )

      finish(M)
      pad.dispose()
      await sleep(300)
      process.exit(process.exitCode ?? 0)
    }

    void run().catch((error: unknown) => {
      log(M, `FAILED ${String(error)}`)
      pad?.dispose()
      process.exitCode = 1
      process.exit(1)
    })
  }, [rawControl, rawTarget, pinchTape, rotationTape, controlPinchTape])

  return (
    <View style={{ flex: 1 }}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, rotation)}>
        {/*
          `flex: 1` on the GtkBox, not just on the View around it: the raw
          GTK controllers go on THIS widget, and an unstyled GtkBox allocates
          zero height. Controllers on a zero-height rectangle can never have
          the pointer inside them, and every assertion would read zero for
          the wrong reason.
        */}
        <View style={{ flex: 1, backgroundColor: "#1c3f5f" }}>
          <GtkBox
            ref={targetRef}
            style={{ flex: 1 }}
          />
        </View>
      </GestureDetector>
      <GestureDetector gesture={controlPinch}>
        <View style={{ flex: 1, backgroundColor: "#3f1c1c" }}>
          <GtkBox
            ref={controlRef}
            style={{ flex: 1 }}
          />
        </View>
      </GestureDetector>
    </View>
  )
}

export const runTouchpadProbe = (): void => {
  AppRegistry.registerComponent("probe", () => Probe)
  AppRegistry.runApplication("probe", {})
}
