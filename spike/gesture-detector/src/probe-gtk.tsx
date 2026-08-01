// PROBE 1 and PROBE 4, driven by real `zwlr_virtual_pointer_v1` injection.
//
// Probe 1 is the one the whole epic rests on. `Gesture.Pan().activeOffsetY([-10, 10])`
// means "watch the finger, stay BEGAN, activate only after 10px of vertical
// movement — and let a sibling win if it goes horizontal instead". That is
// only reachable if a GTK controller reports motion WITHOUT claiming the
// sequence, for as long as the recognizer needs to make up its mind. If GTK
// forces a claim earlier, or stops reporting until claimed, the faithful
// behaviour does not exist here and the epic changes shape.
//
// So this file asks GTK directly, on raw widgets with no React Native in the
// way, with the sequence state read out of GTK at every step:
//
//   A. an unclaimed gesture and its unclaimed ancestor both see the whole drag
//   B. claiming LATE, on the source, keeps the source's own events coming
//      and denies the ancestor
//   C. claiming on the ANCESTOR cancels the descendant (the shipped bug from
//      slice 3, restated as a measurement rather than a memory)
//   D. GtkGestureZoom / GtkGestureRotate under this harness — probe 4
//
// The negative control is a zone the pointer never visits. A Wayland pointer
// is addressed by POSITION, so "something fired" is never evidence on its
// own: the control has to stay at zero in every run.
import { useLayoutEffect, useRef } from "react"
import { AppRegistry, View } from "react-native"
import { Gtk, GtkBox } from "react-native-gtkx/gtk"
import {
  centreOf,
  check,
  finish,
  fullscreen,
  log,
  openPointer,
  rectOf,
  sleep,
} from "./harness"

const M = "gd-probe"

/** GTK's own enum, restated so a log line is readable. */
const STATE_NAMES = ["NONE", "CLAIMED", "DENIED"]

// `gtk_gesture_get_sequence_state()` is not usable here: a mouse has no
// GdkEventSequence (`gdk_event_get_event_sequence()` returns NULL for every
// pointer event) and the binding cannot take NULL for that argument. The
// `::sequence-state-changed` signal reports the same thing as it happens,
// which is better anyway — it dates each transition instead of sampling it.
type Tape = {
  name: string
  begin: number
  update: number
  end: number
  cancel: number
  /** Every signal in order, so an ordering question is answerable later. */
  states: string[]
  /** GtkEventSequenceState values seen through ::sequence-state-changed. */
  transitions: string[]
  /** Offsets reported by drag-update, so "did it keep tracking" is answerable. */
  offsets: { x: number; y: number }[]
}

const newTape = (name: string): Tape => ({
  name,
  begin: 0,
  update: 0,
  end: 0,
  cancel: 0,
  states: [],
  transitions: [],
  offsets: [],
})

const reset = (tape: Tape): void => {
  tape.begin = 0
  tape.update = 0
  tape.end = 0
  tape.cancel = 0
  tape.states = []
  tape.transitions = []
  tape.offsets = []
}

type Probe = {
  widget: Gtk.Widget
  gesture: Gtk.GestureDrag
  tape: Tape
}

const attachDrag = (
  widget: Gtk.Widget,
  name: string,
  onUpdate?: (probe: Probe, index: number) => void,
): Probe => {
  const gesture = new Gtk.GestureDrag()
  const tape = newTape(name)
  const probe: Probe = { widget, gesture, tape }
  gesture.on("sequence-state-changed", (_sequence: unknown, state: number) => {
    const label = STATE_NAMES[state] ?? String(state)
    tape.transitions.push(label)
    tape.states.push(`->${label}`)
  })
  gesture.on("drag-begin", () => {
    tape.begin += 1
    tape.states.push("begin")
  })
  gesture.on("drag-update", (x: number, y: number) => {
    tape.update += 1
    tape.offsets.push({ x, y })
    tape.states.push(`update${tape.update}`)
    onUpdate?.(probe, tape.update)
  })
  gesture.on("drag-end", () => {
    tape.end += 1
    tape.states.push("end")
  })
  gesture.on("cancel", () => {
    tape.cancel += 1
    tape.states.push("cancel")
  })
  widget.addController(gesture)
  return probe
}

const box = (width: number, height: number, css: string): Gtk.Box => {
  const widget = new Gtk.Box()
  widget.setSizeRequest(width, height)
  widget.setCssClasses([css])
  return widget
}

const Stage = () => {
  const hostRef = useRef<Gtk.Box | null>(null)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    // Raw GTK, laid out by GtkFixed at coordinates this file chose. No Yoga,
    // no RN component in the path: probe 1 is a question about GTK, and a
    // layout engine between the pointer and the controller is one more thing
    // that could explain a result.
    const fixed = new Gtk.Fixed()
    host.append(fixed)

    const ancestor = box(420, 420, "zone-ancestor")
    const source = box(220, 220, "zone-source")
    ancestor.append(source)
    fixed.put(ancestor, 40, 40)

    // Never visited by the pointer. Every assertion below is worth exactly
    // as much as this one staying at zero.
    const control = box(300, 300, "zone-control")
    fixed.put(control, 620, 40)

    let claimAt: { probe: "source" | "ancestor"; index: number } | null = null

    const sourceProbe = attachDrag(source, "source", (probe, index) => {
      if (claimAt?.probe === "source" && index === claimAt.index) {
        probe.gesture.setState(Gtk.EventSequenceState.CLAIMED)
        log(M, `claimed on SOURCE at update ${index}`)
      }
    })
    const ancestorProbe = attachDrag(ancestor, "ancestor", (probe, index) => {
      if (claimAt?.probe === "ancestor" && index === claimAt.index) {
        probe.gesture.setState(Gtk.EventSequenceState.CLAIMED)
        log(M, `claimed on ANCESTOR at update ${index}`)
      }
    })
    const controlProbe = attachDrag(control, "control")

    // PROBE 4. GTK's touchpad gestures, on the same widget, alive for every
    // run below — so "they never fired" is a measurement over the whole
    // session rather than one snapshot.
    let zoomEvents = 0
    let rotateEvents = 0
    let zoomConstructed = false
    let rotateConstructed = false
    try {
      const zoom = new Gtk.GestureZoom()
      zoom.on("scale-changed", () => {
        zoomEvents += 1
      })
      zoom.on("begin", () => {
        zoomEvents += 1
      })
      source.addController(zoom)
      zoomConstructed = true
    } catch (error) {
      log(M, `GestureZoom could not be constructed: ${String(error)}`)
    }
    try {
      const rotate = new Gtk.GestureRotate()
      rotate.on("angle-changed", () => {
        rotateEvents += 1
      })
      rotate.on("begin", () => {
        rotateEvents += 1
      })
      source.addController(rotate)
      rotateConstructed = true
    } catch (error) {
      log(M, `GestureRotate could not be constructed: ${String(error)}`)
    }

    const run = async (): Promise<void> => {
      // The pointer first: creating the virtual device is what makes the
      // compositor advertise pointer capability to GTK, and a seat with no
      // pointer changes what the window ever sees.
      const pointer = await openPointer()
      await fullscreen(M, host)
      log(
        M,
        `ancestor rect=${JSON.stringify(rectOf(ancestor))} source rect=${JSON.stringify(rectOf(source))} control rect=${JSON.stringify(rectOf(control))}`,
      )

      const clearAll = (): void => {
        reset(sourceProbe.tape)
        reset(ancestorProbe.tape)
        reset(controlProbe.tape)
      }

      const drag = async (steps: number, dx: number, dy: number) => {
        const start = centreOf(source)
        pointer.moveTo(start.x, start.y)
        await sleep(60)
        pointer.press()
        await sleep(60)
        for (let i = 1; i <= steps; i += 1) {
          pointer.moveTo(start.x + i * dx, start.y + i * dy)
          await sleep(45)
        }
        pointer.release()
        await sleep(80)
      }

      // ---- A. nobody claims -------------------------------------------
      clearAll()
      claimAt = null
      await drag(10, 0, 9)

      const a = {
        source: { ...sourceProbe.tape },
        ancestor: { ...ancestorProbe.tape },
      }
      log(M, `A source states: ${sourceProbe.tape.states.join(" ")}`)
      log(M, `A ancestor states: ${ancestorProbe.tape.states.join(" ")}`)

      check(
        M,
        "motion arrives on press, before any claim",
        a.source.begin === 1 && a.source.update >= 8,
        `drag-begin=${a.source.begin}, drag-update=${a.source.update} over 10 injected moves`,
      )
      check(
        M,
        "an unclaimed gesture watches the whole drag",
        a.source.transitions.length === 0 &&
          a.source.end === 1 &&
          a.source.cancel === 0 &&
          (a.source.offsets.at(-1)?.y ?? 0) >= 80,
        `sequence-state changes=${a.source.transitions.length}, end=${a.source.end}, cancel=${a.source.cancel}, last offset y=${
          a.source.offsets.at(-1)?.y
        } over 90px of injected motion`,
      )
      check(
        M,
        "an ancestor sees the same unclaimed motion (two live recognizers, one pointer)",
        a.ancestor.begin === 1 &&
          a.ancestor.update === a.source.update &&
          a.ancestor.transitions.length === 0,
        `ancestor begin=${a.ancestor.begin} update=${a.ancestor.update} state changes=${a.ancestor.transitions.length}, vs source update=${a.source.update}`,
      )
      check(
        M,
        "NEGATIVE CONTROL: the untouched zone stayed silent (run A)",
        controlProbe.tape.begin === 0 && controlProbe.tape.update === 0,
        `control begin=${controlProbe.tape.begin} update=${controlProbe.tape.update}`,
      )

      // ---- B. the source claims LATE ----------------------------------
      clearAll()
      claimAt = { probe: "source", index: 4 }
      await drag(10, 0, 9)

      log(M, `B source states: ${sourceProbe.tape.states.join(" ")}`)
      log(M, `B ancestor states: ${ancestorProbe.tape.states.join(" ")}`)

      check(
        M,
        "claiming late on the SOURCE keeps its own stream alive",
        sourceProbe.tape.update >= 8 &&
          sourceProbe.tape.cancel === 0 &&
          sourceProbe.tape.transitions.includes("CLAIMED"),
        `source update=${sourceProbe.tape.update} cancel=${sourceProbe.tape.cancel} transitions=[${sourceProbe.tape.transitions.join(",")}]`,
      )
      // Measured, and it is the REVERSE of what docs/research/gestures.md
      // records ("DENIED on every gesture on parent widgets, ::cancel on
      // everything underneath"). On GTK 4.22.4 a claim by the DEEPER
      // controller cancels the ancestor outright, with no state transition
      // on it at all; run C below shows the other direction, which denies.
      check(
        M,
        "the claim CANCELS the ancestor's gesture (no DENIED transition on it)",
        ancestorProbe.tape.cancel === 1 &&
          ancestorProbe.tape.transitions.length === 0 &&
          ancestorProbe.tape.update < sourceProbe.tape.update,
        `ancestor update=${ancestorProbe.tape.update} cancel=${ancestorProbe.tape.cancel} transitions=[${ancestorProbe.tape.transitions.join(",")}]`,
      )
      check(
        M,
        "NEGATIVE CONTROL: the untouched zone stayed silent (run B)",
        controlProbe.tape.begin === 0 && controlProbe.tape.update === 0,
        `control begin=${controlProbe.tape.begin} update=${controlProbe.tape.update}`,
      )

      // ---- C. the ancestor claims (the shipped bug, as a measurement) ---
      clearAll()
      claimAt = { probe: "ancestor", index: 4 }
      await drag(10, 0, 9)

      log(M, `C source states: ${sourceProbe.tape.states.join(" ")}`)
      log(M, `C ancestor states: ${ancestorProbe.tape.states.join(" ")}`)

      check(
        M,
        "claiming on the ANCESTOR kills the descendant's stream — why the claim must go on the source",
        sourceProbe.tape.update < ancestorProbe.tape.update &&
          sourceProbe.tape.update <= 5,
        `source update=${sourceProbe.tape.update} cancel=${sourceProbe.tape.cancel} end=${sourceProbe.tape.end} transitions=[${sourceProbe.tape.transitions.join(",")}] vs ancestor update=${ancestorProbe.tape.update}`,
      )
      check(
        M,
        "and it ends the descendant rather than cancelling it — a clean release is what JS sees",
        sourceProbe.tape.cancel === 0 && sourceProbe.tape.end === 1,
        `source terminal signals: cancel=${sourceProbe.tape.cancel} end=${sourceProbe.tape.end}, sequence transitions=[${sourceProbe.tape.transitions.join(",")}]`,
      )
      check(
        M,
        "NEGATIVE CONTROL: the untouched zone stayed silent (run C)",
        controlProbe.tape.begin === 0 && controlProbe.tape.update === 0,
        `control begin=${controlProbe.tape.begin} update=${controlProbe.tape.update}`,
      )

      // ---- D. probe 4 --------------------------------------------------
      // A wheel is the only other thing this harness can inject; ctrl+wheel
      // is what a DESKTOP app treats as zoom, and it is emphatically not a
      // GdkTouchpadEvent. Injecting it here makes the zero below mean "the
      // harness cannot feed these", not "we forgot to try".
      // (Only downward: `scrollBy` encodes its wl_fixed argument as an
      // unsigned word, so a negative detent count throws before it reaches
      // the wire; see docs/research/gesture-detector.md. Irrelevant here.)
      pointer.scrollBy(3)
      await sleep(80)
      pointer.scrollBy(3)
      await sleep(80)

      check(
        M,
        "GtkGestureZoom/GtkGestureRotate exist in the bindings",
        zoomConstructed && rotateConstructed,
        `zoom=${zoomConstructed} rotate=${rotateConstructed}`,
      )
      check(
        M,
        "and neither fires from anything zwlr_virtual_pointer_v1 can send",
        zoomEvents === 0 && rotateEvents === 0,
        `zoom events=${zoomEvents} rotate events=${rotateEvents} after a full drag session plus wheel`,
      )

      pointer.dispose()
      finish(M)
      setTimeout(() => {
        process.exit(process.exitCode ?? 0)
      }, 200)
    }

    void run().catch((error: unknown) => {
      log(M, `FAIL harness error — ${String(error)}`)
      process.exitCode = 1
      setTimeout(() => {
        process.exit(1)
      }, 200)
    })
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: "#241f31" }}>
      <GtkBox
        ref={hostRef}
        style={{ flex: 1 }}
      />
    </View>
  )
}

export const runGtkProbe = (): void => {
  AppRegistry.registerComponent("GtkProbe", () => Stage)
  AppRegistry.runApplication("GtkProbe", {
    title: "gesture-detector probe",
    width: 1024,
    height: 768,
  })
}
