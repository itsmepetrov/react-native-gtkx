// PROBE 7: real stylus pressure, injected, all the way into
// `Gesture.ForceTouch()`.
//
// `src/gesture-handler-compat/force-touch.ts` opens by calling itself the
// least verified thing in the module, and that was accurate: every other
// recognizer is driven end to end by injected input in the test suite, and
// this one could not be, because pressure is not something a client
// synthesizes. `wl_pointer` has no pressure axis; the tablet protocol
// (`zwp_tablet_v2`) has one and nothing can write into it from user space.
//
// This probe closes that gap the same way probe 6 closed the pinch one — one
// layer below Wayland. A virtual pen tablet on `/dev/uinput`
// (`tests/gtk/support/virtual-stylus.ts`) is a device libinput classifies as a
// tablet and reads pressure off, so the whole chain becomes real:
//
//   uinput -> evdev -> libinput -> compositor -> GDK -> GtkGestureStylus
//                                                    -> Gesture.ForceTouch()
//
// THE SAME ONE CONSTRAINT probe 6 has, for the same reason: the compositor in
// that chain needs a libinput backend. The headless sway `run-headless.sh`
// starts — and the one `@gtkx/vitest` starts per worker — is launched with
// `WLR_BACKENDS=headless` and `WLR_LIBINPUT_NO_DEVICES=1`, enumerates zero
// input devices, and cannot see a uinput tablet at all. `run-stylus.sh` runs
// this against the desktop session's compositor, which is the only one here
// that has one. `ForceTouch` therefore lives with exactly the split `Pinch`
// and `Rotation` already live with.
//
// A: raw GTK, no React Native in the path — a bare `Gtk.GestureStylus` on a
//    plain `GtkBox`, which answers the decisive question first (does GDK hand
//    a client varying pressure at all) and, being on a card no
//    `GestureDetector` covers, cannot interact with the module's own stylus
//    controllers. It is also what makes the compositor's transfer curve
//    visible: mutter's is roughly QUADRATIC, so GTK reports about the SQUARE
//    of the injected fraction and no assertion below may expect linearity.
// B: the shipped module — `Gesture.ForceTouch()` inside a real
//    `GestureDetector`, twice: once with no ceiling, to watch a ramp activate
//    and report rising force, and once with a `maxForce` low enough that the
//    same ramp runs THROUGH it, to watch an already-active gesture cancel.
//
// The negative control is a fourth card the pen never visits. A tablet is
// addressed by absolute position, so "something fired" is not evidence on its
// own; the control has to stay at zero in every run.
import { useLayoutEffect, useRef } from "react"
import { AppRegistry, View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gtkx/gesture-handler"
import { Gdk, Gtk, GtkBox } from "react-native-gtkx/gtk"
import {
  createVirtualStylus,
  VirtualStylusUnavailable,
  type VirtualStylus,
} from "../../../packages/react-native-gtkx/tests/gtk/support/virtual-stylus"
import { check, finish, fullscreen, log, rectOf, sleep } from "./harness"

const M = "gd-stylus"

/**
 * Upstream's documented default for `minForce`, written out rather than left
 * implicit: the assertion is about a threshold, so the threshold has to be
 * visible next to it.
 */
const MIN_FORCE = 0.2
/**
 * The capped card activates almost immediately and is cancelled well before
 * the ramp ends, so that both edges are inside one injected sweep. With
 * mutter's roughly quadratic curve, GTK crosses 0.05 at an injected ~0.22 and
 * crosses 0.5 at an injected ~0.71 — both comfortably inside a 0.05..1.0 ramp.
 */
const CAPPED_MIN_FORCE = 0.05
const MAX_FORCE = 0.5
/** Frames per ramp. 25 frames at the device's 12ms interval is about 300ms. */
const RAMP_STEPS = 24

/** `POINTER_TYPE.STYLUS` and `POINTER_TYPE.MOUSE` from the module's types. */
const POINTER_TYPE_STYLUS = 1
/** `GESTURE_STATE.CANCELLED`. */
const STATE_CANCELLED = 3

type RawTape = {
  downs: number
  motions: number
  ups: number
  /** Every reading `getAxis(PRESSURE)` said it knew, in arrival order. */
  pressures: number[]
  /** Events where the tool reported no pressure axis at all. */
  unknown: number
  tool: string
}

const newRawTape = (): RawTape => ({
  downs: 0,
  motions: 0,
  ups: 0,
  pressures: [],
  unknown: 0,
  tool: "none",
})

/**
 * A bare `Gtk.GestureStylus`, which is the only reading in this file with no
 * React Native between it and GDK.
 *
 * `getAxis` may ONLY be called from inside one of the gesture's own signal
 * handlers — the axis is read off the controller's CURRENT event — which is
 * why every handler reads it itself instead of sharing a getter.
 */
const instrument = (widget: Gtk.Widget, tape: RawTape): void => {
  const stylus = new Gtk.GestureStylus()
  const record = (): void => {
    const [known, value] = stylus.getAxis(Gdk.AxisUse.PRESSURE)
    if (known) {
      tape.pressures.push(value)
    } else {
      tape.unknown += 1
    }
    const tool = stylus.getDeviceTool()
    if (tool) {
      tape.tool = String(tool.getToolType())
    }
  }
  stylus.on("down", () => {
    tape.downs += 1
    record()
  })
  stylus.on("motion", () => {
    tape.motions += 1
    record()
  })
  stylus.on("up", () => {
    tape.ups += 1
  })
  widget.addController(stylus)
}

type ForceTape = {
  name: string
  begin: number
  start: number
  updates: number
  end: number
  finalize: number
  /** Every callback in the order it fired, so the progression is assertable. */
  order: string[]
  /** `force` on each `onUpdate`, in order. */
  forces: number[]
  startForce: number | null
  endForce: number | null
  endState: number | null
  endSuccess: boolean | null
  /** Distinct `pointerType` values seen on any payload. */
  pointerTypes: Set<number>
}

const newForceTape = (name: string): ForceTape => ({
  name,
  begin: 0,
  start: 0,
  updates: 0,
  end: 0,
  finalize: 0,
  order: [],
  forces: [],
  startForce: null,
  endForce: null,
  endState: null,
  endSuccess: null,
  pointerTypes: new Set<number>(),
})

const monotonic = (values: number[]): boolean =>
  values.every((value, index) => index === 0 || value >= values[index - 1]!)

const fixed = (values: number[]): string =>
  values.map((value) => value.toFixed(4)).join(" ")

/**
 * The tablet, opened BEFORE the GTK application starts. Module state rather
 * than a ref because it has to outlive — and predate — the React tree; see
 * `runStylusProbe` for why the ordering is the whole ballgame.
 */
let openPen: VirtualStylus = null as unknown as VirtualStylus

const Probe = (): React.ReactNode => {
  const rawRef = useRef<Gtk.Widget | null>(null)
  const targetRef = useRef<Gtk.Widget | null>(null)
  const cappedRef = useRef<Gtk.Widget | null>(null)
  const controlRef = useRef<Gtk.Widget | null>(null)

  const raw = useRef(newRawTape()).current
  const targetTape = useRef(newForceTape("target")).current
  const cappedTape = useRef(newForceTape("capped")).current
  const controlTape = useRef(newForceTape("control")).current

  const wire = (
    builder: ReturnType<typeof Gesture.ForceTouch>,
    tape: ForceTape,
  ): ReturnType<typeof Gesture.ForceTouch> =>
    builder
      .onBegin((event) => {
        tape.begin += 1
        tape.order.push("begin")
        tape.pointerTypes.add(event.pointerType)
      })
      .onStart((event) => {
        tape.start += 1
        tape.order.push("start")
        tape.startForce = event.force
        tape.pointerTypes.add(event.pointerType)
      })
      .onUpdate((event) => {
        tape.updates += 1
        tape.order.push("update")
        tape.forces.push(event.force)
        tape.pointerTypes.add(event.pointerType)
      })
      .onEnd((event, success) => {
        tape.end += 1
        tape.order.push("end")
        tape.endForce = event.force
        tape.endState = event.state
        tape.endSuccess = success
        tape.pointerTypes.add(event.pointerType)
      })
      .onFinalize(() => {
        tape.finalize += 1
        tape.order.push("finalize")
      })

  const targetForce = wire(Gesture.ForceTouch().minForce(MIN_FORCE), targetTape)
  const cappedForce = wire(
    Gesture.ForceTouch().minForce(CAPPED_MIN_FORCE).maxForce(MAX_FORCE),
    cappedTape,
  )
  const controlForce = wire(Gesture.ForceTouch(), controlTape)

  useLayoutEffect(() => {
    const rawWidget = rawRef.current
    const target = targetRef.current
    const capped = cappedRef.current
    const control = controlRef.current
    if (!rawWidget || !target || !capped || !control) {
      return
    }
    instrument(rawWidget, raw)

    // Created before this process was a Wayland client at all — see
    // `runStylusProbe` at the bottom of the file, where the ordering is
    // explained and where the SKIP is handled.
    const pen = openPen
    const run = async (): Promise<void> => {
      await fullscreen(M, target)

      // The tablet is mapped whole-area-onto-whole-screen (it is an EXTERNAL
      // tablet — see virtual-stylus.ts), so a coordinate is a fraction of the
      // display. The window is fullscreen, so a fraction of the window is the
      // same thing, and the aim comes out of GTK's own allocation rather than
      // out of a hardcoded resolution.
      const root = target.getRoot() as unknown as Gtk.Widget
      const screen = { width: root.getWidth(), height: root.getHeight() }
      const aim = (widget: Gtk.Widget): { x: number; y: number } => {
        const rect = rectOf(widget)
        return {
          x: (rect.x + rect.width / 2) / screen.width,
          y: (rect.y + rect.height / 2) / screen.height,
        }
      }
      const rawAim = aim(rawWidget)
      const targetAim = aim(target)
      const cappedAim = aim(capped)
      log(
        M,
        `screen=${JSON.stringify(screen)} raw=${JSON.stringify(rawAim)} ` +
          `target=${JSON.stringify(targetAim)} capped=${JSON.stringify(cappedAim)} ` +
          `control=${JSON.stringify(rectOf(control))}`,
      )

      // ONE PROXIMITY CYCLE FOR THE WHOLE PROBE, and it is not a stylistic
      // choice — see point 3 in virtual-stylus.ts. A client is routed exactly
      // one cycle: whichever `proximity_in` mutter announces the tool with is
      // the only one it will ever forward, and every later one is dropped
      // silently while libinput goes on emitting them perfectly. Measured
      // here, on the wire, before this was restructured: three of the four
      // cycles an earlier shape of this probe injected reached libinput in
      // full and reached the client not at all.
      //
      // The pen may be pressed and lifted as often as it likes WITHIN the
      // cycle, so every zone is measured by hovering across to it and pressing
      // again — which is what a real pen does anyway.
      // `pen` is assigned above; these closures only run after that.
      const device = pen as VirtualStylus
      await device.proximityIn(targetAim.x, targetAim.y)
      await sleep(200)

      /** One press at `at`: tip down at the low end of a ramp, up at the top. */
      const press = async (
        at: { x: number; y: number },
        from: number,
        to: number,
      ): Promise<void> => {
        // Hover across first. A zero-pressure frame keeps the tip up, so the
        // travel between zones cannot be mistaken for a drag.
        await device.moveTo(at.x, at.y, 0)
        await sleep(100)
        await device.ramp(
          { x: at.x, y: at.y, force: from },
          { x: at.x, y: at.y, force: to },
          RAMP_STEPS,
        )
        await sleep(150)
        // Zero pressure lifts the tip, which is the `up` GtkGestureStylus
        // turns into the end of the gesture.
        await device.moveTo(at.x, at.y, 0)
        await sleep(300)
      }

      // --- A: raw GTK ------------------------------------------------------
      await press(rawAim, 0.05, 1.0)
      log(M, `raw GTK pressures: ${fixed(raw.pressures)}`)
      log(
        M,
        `raw downs=${raw.downs} motions=${raw.motions} ups=${raw.ups} ` +
          `no-pressure-axis=${raw.unknown} tool=${raw.tool}`,
      )
      const rawPeak =
        raw.pressures.length === 0 ? null : Math.max(...raw.pressures)
      check(
        M,
        "GDK hands a GTK4 client varying pressure off a tablet tool",
        raw.pressures.length > 5 && new Set(raw.pressures).size > 5,
        `${raw.pressures.length} readings, ${new Set(raw.pressures).size} distinct, peak ${rawPeak}`,
      )
      check(
        M,
        "raw pressure rises monotonically over a rising ramp",
        monotonic(raw.pressures) && raw.pressures.length > 5,
        `first=${raw.pressures[0]} last=${raw.pressures[raw.pressures.length - 1]}`,
      )
      check(
        M,
        "raw pressure reaches ~1.0 at full injected pressure",
        rawPeak !== null && rawPeak > 0.9,
        `peak=${rawPeak} (injected peak was 1.0)`,
      )

      // --- B: the shipped module, no ceiling -------------------------------
      await press(targetAim, 0.05, 1.0)
      log(M, `Gesture.ForceTouch() forces: ${fixed(targetTape.forces)}`)
      log(M, `order: ${targetTape.order.join(" ")}`)
      check(
        M,
        "a ramp past minForce runs onStart -> onUpdate* -> onEnd",
        targetTape.begin === 1 &&
          targetTape.start === 1 &&
          targetTape.updates > 3 &&
          targetTape.end === 1 &&
          targetTape.order.indexOf("start") <
            targetTape.order.indexOf("update") &&
          targetTape.order.lastIndexOf("update") <
            targetTape.order.indexOf("end"),
        `begin=${targetTape.begin} start=${targetTape.start} updates=${targetTape.updates} end=${targetTape.end} success=${targetTape.endSuccess}`,
      )
      check(
        M,
        "it activated AT the threshold, not below it",
        targetTape.startForce !== null && targetTape.startForce >= MIN_FORCE,
        `minForce=${MIN_FORCE} force at activation=${targetTape.startForce}`,
      )
      check(
        M,
        "`force` is monotonically increasing over a rising ramp",
        monotonic(targetTape.forces) && targetTape.forces.length > 3,
        `${targetTape.forces.length} updates, ${fixed(targetTape.forces.slice(0, 3))} ... ${fixed(targetTape.forces.slice(-3))}`,
      )
      const peak =
        targetTape.forces.length === 0 ? null : Math.max(...targetTape.forces)
      check(
        M,
        "`force` reaches ~1.0 at full pressure",
        peak !== null && peak > 0.9,
        `peak force=${peak}`,
      )
      check(
        M,
        "`pointerType` on the payload is STYLUS, not MOUSE",
        targetTape.pointerTypes.size === 1 &&
          targetTape.pointerTypes.has(POINTER_TYPE_STYLUS),
        `pointerTypes seen = ${JSON.stringify([...targetTape.pointerTypes])} (STYLUS=1, MOUSE=2)`,
      )

      // --- B: the shipped module, with a ceiling ---------------------------
      await press(cappedAim, 0.05, 1.0)
      // The one `proximity_out` of the run, now that every zone has been
      // pressed. Nothing may be injected after it — see the cycle note above.
      await device.proximityOut()
      await sleep(200)
      log(M, `capped forces: ${fixed(cappedTape.forces)}`)
      log(M, `capped order: ${cappedTape.order.join(" ")}`)
      check(
        M,
        "maxForce CANCELS a gesture that had already activated",
        cappedTape.start === 1 &&
          cappedTape.updates > 0 &&
          cappedTape.end === 1 &&
          cappedTape.endSuccess === false &&
          cappedTape.endState === STATE_CANCELLED,
        `start=${cappedTape.start} updates=${cappedTape.updates} end=${cappedTape.end} success=${cappedTape.endSuccess} state=${cappedTape.endState} (CANCELLED=3)`,
      )
      check(
        M,
        "the cancellation happened above maxForce and no update followed it",
        cappedTape.endForce !== null &&
          cappedTape.endForce > MAX_FORCE &&
          cappedTape.order.lastIndexOf("update") <
            cappedTape.order.indexOf("end"),
        `maxForce=${MAX_FORCE} force at cancel=${cappedTape.endForce} last update force=${cappedTape.forces[cappedTape.forces.length - 1]}`,
      )

      // --- the negative control -------------------------------------------
      check(
        M,
        "NEGATIVE CONTROL: the card the pen never touched saw nothing",
        controlTape.begin === 0 &&
          controlTape.start === 0 &&
          controlTape.updates === 0 &&
          controlTape.end === 0 &&
          controlTape.finalize === 0,
        `control begin=${controlTape.begin} start=${controlTape.start} updates=${controlTape.updates} end=${controlTape.end} finalize=${controlTape.finalize}`,
      )

      finish(M)
      pen.dispose()
      await sleep(300)
      process.exit(process.exitCode ?? 0)
    }

    void run().catch((error: unknown) => {
      log(M, `FAILED ${String(error)}`)
      pen?.dispose()
      process.exitCode = 1
      process.exit(1)
    })
  }, [raw, targetTape, cappedTape, controlTape])

  return (
    <View style={{ flex: 1 }}>
      {/*
        The raw card carries no GestureDetector on purpose. Two
        `Gtk.GestureStylus` controllers in one propagation chain is a question
        about GTK's sequence claiming that this probe has no business
        answering — keeping the raw reading on a card of its own makes part A
        and part B independent measurements of the same injected ramp.
      */}
      <View style={{ flex: 1, backgroundColor: "#1c3f5f" }}>
        <GtkBox
          ref={rawRef}
          style={{ flex: 1 }}
        />
      </View>
      <GestureDetector gesture={targetForce}>
        <View style={{ flex: 1, backgroundColor: "#1c5f3f" }}>
          <GtkBox
            ref={targetRef}
            style={{ flex: 1 }}
          />
        </View>
      </GestureDetector>
      <GestureDetector gesture={cappedForce}>
        <View style={{ flex: 1, backgroundColor: "#5f4f1c" }}>
          <GtkBox
            ref={cappedRef}
            style={{ flex: 1 }}
          />
        </View>
      </GestureDetector>
      <GestureDetector gesture={controlForce}>
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

/**
 * THE TABLET IS CREATED BEFORE THE APPLICATION IS, and that ordering is not a
 * detail — it is the single thing that decides whether this probe measures
 * anything at all.
 *
 * Measured, with the reference rig's own GTK client so that nothing in this
 * repo was on trial: a Wayland client that was ALREADY CONNECTED when the
 * tablet appeared is never routed the tool. Same client, same device, same
 * injected ramp, only the order changed:
 *
 *   device, warm-up, then client   -> 24 pressure samples, 0.0016 .. 1.0000
 *   client, then device            -> 0 samples
 *   client, then device, warm-up   -> 0 samples
 *
 * mutter announces `tablet_added` to an existing client and then never follows
 * with `tool_added`; a client that binds `zwp_tablet_seat_v2` after the device
 * exists gets both. So the device is opened here, at the top of the run,
 * before `AppRegistry.runApplication` builds the GTK application and connects
 * — and `createVirtualStylus` burns its throwaway proximity cycle while there
 * is genuinely no client to swallow it from.
 */
export const runStylusProbe = async (): Promise<void> => {
  try {
    openPen = await createVirtualStylus()
  } catch (error) {
    if (error instanceof VirtualStylusUnavailable) {
      log(M, `SKIP no virtual stylus: ${error.message}`)
      finish(M)
      process.exit(process.exitCode ?? 0)
    }
    throw error
  }
  AppRegistry.registerComponent("probe", () => Probe)
  AppRegistry.runApplication("probe", {})
}
