// `overflow: "hidden"` on a View, measured on the render tree GTK actually
// paints and on gtk_widget_pick() — never on the widget property we set,
// because reading that back would pass just as happily while nothing reached
// the paint (which is precisely the bug this file exists for: the style had
// been reaching Yoga, and only Yoga, since the beginning).
//
// The paint assertions go through `gsk_render_node_write_to_file()`: a
// container's snapshot is a tree, and its ROOT bounds are the union of what
// was drawn, so a child that escapes widens them and a clipped one does not.
// The dump also names the clip node, which is the only way to tell a
// rectangular clip from a rounded one — the bounds are identical either way.
import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { TransformPart } from "../../../src/contracts"
import { Gtk, type Gsk } from "../../../src/gtkx/bridge/index"
import { Pressable, Root, View } from "../../../src/index"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "../../../src/reanimated-compat/index"
import {
  createVirtualPointer,
  VirtualPointerUnavailable,
  type VirtualPointer,
} from "../support/virtual-pointer"

const OUTPUT = { width: 1024, height: 768 }

const settle = (ms = 60): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const widget = (testID: string): Gtk.Widget =>
  screen.getByName(testID) as unknown as Gtk.Widget

/** The subtree GTK paints for `clip`, taken from its real parent so that the
 *  wrapper which applies the overflow clip is the one that runs. */
const paintNode = (): Gsk.RenderNode => {
  const snapshot = Gtk.Snapshot.new()
  widget("stage").snapshotChild(widget("clip"), snapshot)
  const node = snapshot.toNode()
  if (!node) {
    throw new Error("the clip container painted nothing")
  }
  return node
}

type Box = { x: number; y: number; width: number; height: number }

/** Bounds of everything the container drew, in the stage's coordinates. */
const paintedBounds = (): Box => {
  const bounds = paintNode().getBounds()
  return {
    x: Math.round(bounds.getX()),
    y: Math.round(bounds.getY()),
    width: Math.round(bounds.getWidth()),
    height: Math.round(bounds.getHeight()),
  }
}

let dumpSeq = 0

/** GSK's own textual serialization of the paint tree. */
const paintDump = (): string => {
  dumpSeq += 1
  const file = join(tmpdir(), `rn-gtkx-overflow-${process.pid}-${dumpSeq}.node`)
  if (!paintNode().writeToFile(file)) {
    throw new Error("could not serialize the render node")
  }
  return readFileSync(file, "utf8")
}

const pickName = (x: number, y: number): string | null =>
  widget("stage").pick(x, y, Gtk.PickFlags.DEFAULT)?.getName() ?? null

// A 100x100 container at (50,50) holding a 100x40 child at (60,20) inside it —
// so the child reaches x 210 in stage coordinates and overhangs the container's
// right edge by 60px. Both are painted (a colour node each), which is what
// makes the union bounds mean something.
const stage = (
  overflow?: "visible" | "hidden" | "scroll",
  extra?: {
    radius?: number
    borderWidth?: number
    transform?: TransformPart[]
  },
) => (
  <Root
    width={400}
    height={400}
  >
    <View
      style={{ width: 400, height: 400 }}
      testID="stage"
    >
      <View
        style={{
          position: "absolute",
          left: 50,
          top: 50,
          width: 100,
          height: 100,
          backgroundColor: "#26a269",
          borderRadius: extra?.radius ?? 0,
          ...(extra?.borderWidth
            ? { borderWidth: extra.borderWidth, borderColor: "#000000" }
            : null),
          ...(overflow ? { overflow } : null),
        }}
        testID="clip"
      >
        <View
          style={{
            position: "absolute",
            left: 60,
            top: 20,
            width: 100,
            height: 40,
            backgroundColor: "#e01b24",
            ...(extra?.transform ? { transform: extra.transform } : null),
          }}
          testID="escapee"
        />
      </View>
    </View>
  </Root>
)

const mount = async (
  overflow?: "visible" | "hidden" | "scroll",
  extra?: Parameters<typeof stage>[1],
): Promise<void> => {
  await render(stage(overflow, extra))
  await waitFor(() => {
    expect(paintedBounds().width).toBeGreaterThan(0)
  })
}

// --- paint ---------------------------------------------------------------

it("without overflow a child paints past the container, as RN's do", async () => {
  await mount()
  // The baseline every assertion below is measured against: 160 wide, i.e.
  // the container's 100 plus the child's 60px overhang.
  expect(paintedBounds()).toEqual({ x: 50, y: 50, width: 160, height: 100 })
  expect(paintDump()).not.toContain("clip {")
})

it("overflow: hidden clips the child's paint to the container", async () => {
  await mount("hidden")
  expect(paintedBounds()).toEqual({ x: 50, y: 50, width: 100, height: 100 })
  // …and it is a real clip node in the tree GTK paints, over the container's
  // own box, not merely a smaller union.
  expect(paintDump()).toContain("clip: 0 0 100 100;")
})

it("overflow: visible is the default, spelled out", async () => {
  await mount("visible")
  expect(paintedBounds()).toEqual({ x: 50, y: 50, width: 160, height: 100 })
})

it("overflow: scroll clips exactly like hidden — a View does not scroll", async () => {
  // RN's own behaviour on both platforms: any non-visible overflow clips, and
  // only a ScrollView scrolls. Accepting `scroll` and painting nothing was the
  // same silent lie as `hidden`.
  await mount("scroll")
  expect(paintedBounds()).toEqual({ x: 50, y: 50, width: 100, height: 100 })
  expect(widget("clip").getOverflow()).toBe(Gtk.Overflow.HIDDEN)
})

it("the clip goes away again when the style does", async () => {
  const { rerender } = await render(stage("hidden"))
  await waitFor(() => {
    expect(paintedBounds().width).toBe(100)
  })
  await rerender(stage("visible"))
  await waitFor(() => {
    expect(paintedBounds().width).toBe(160)
  })
  await rerender(stage("hidden"))
  await waitFor(() => {
    expect(paintedBounds().width).toBe(100)
  })
})

// --- borderRadius --------------------------------------------------------

it("borderRadius shapes the clip: rounded corners, not a rectangle", async () => {
  await mount("hidden", { radius: 20 })
  // The bounds cannot tell a rounded clip from a square one — they are the
  // same rectangle. The node type and its corner radius can.
  expect(paintedBounds()).toEqual({ x: 50, y: 50, width: 100, height: 100 })
  const dump = paintDump()
  expect(dump).toContain("rounded-clip {")
  expect(dump).toContain("clip: 0 0 100 100 / 20;")

  // And picking follows the same shape: (52,52) is inside the square box and
  // outside the r=20 corner.
  expect(pickName(52, 52)).toBe("stage")
  expect(pickName(100, 100)).toBe("clip")
})

it("without a radius the same corner is inside the clip (the control)", async () => {
  await mount("hidden")
  expect(pickName(52, 52)).toBe("clip")
})

it("a container never clips its own frame — only its children", async () => {
  await mount("hidden", { borderWidth: 10 })
  const dump = paintDump()
  // GTK clips to the CSS padding box: 80x80 inside a 10px border. That is
  // already the box a child is laid out in (the widget's own coordinate
  // system starts there), so the clip takes nothing away that a child could
  // legitimately have used.
  expect(dump).toContain("clip: 0 0 80 80;")
  // The background and the border are SIBLINGS of the clip node, not inside
  // it — which is why a view's own frame, shadow and outline survive its own
  // `overflow: "hidden"`. A parent's, of course, still clips them.
  expect(dump).toContain("widths: 10;")
  expect(paintedBounds()).toEqual({ x: 50, y: 50, width: 100, height: 100 })
})

// --- the transform path --------------------------------------------------

it("a transformed child paints and picks past an unclipped container", async () => {
  await mount("visible", { transform: [{ translateX: 120 }] })
  // Paint-only, so the child draws 120px further right: 50..330.
  expect(paintedBounds()).toEqual({ x: 50, y: 50, width: 280, height: 100 })
  expect(pickName(230, 90)).toBe("escapee")
})

it("a transformed child is clipped too, and picked where it is drawn", async () => {
  await mount("hidden", { transform: [{ translateX: 120 }] })
  // Gone from the paint entirely — the whole child is past the edge now.
  expect(paintedBounds()).toEqual({ x: 50, y: 50, width: 100, height: 100 })
  // …and gone from the picking, which is the half that could have disagreed.
  expect(pickName(230, 90)).toBe("stage")
  // Negative control: the container itself is still there and still pickable.
  expect(pickName(100, 90)).toBe("clip")
})

// --- hit-testing, through a real pointer ---------------------------------

let pointer: VirtualPointer | null = null

beforeEach(() => {
  pointer = null
})

afterEach(() => {
  pointer?.dispose()
  pointer = null
  vi.restoreAllMocks()
})

const withPointer = async (): Promise<VirtualPointer | null> => {
  try {
    pointer = await createVirtualPointer(OUTPUT)
    return pointer
  } catch (error) {
    if (error instanceof VirtualPointerUnavailable) {
      console.warn(`[overflow] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

it("a child driven out of a clipped parent stops answering the pointer", async () => {
  // gtk_widget_pick() above is the routine input goes through, but "goes
  // through" is an argument, not a measurement — so this drives the same
  // stage with a REAL Wayland pointer, through the compositor and GDK. The
  // child leaves by the transform path that carries an animated absolute
  // `top`, which is the interaction most likely to disagree with the paint.
  const device = await withPointer()
  if (!device) {
    return
  }

  const onInside = vi.fn()
  const onElsewhere = vi.fn()
  let boxTop: SharedValue<number>

  const Stage = () => {
    const top = useSharedValue(0)
    useEffect(() => {
      boxTop = top
    })
    const style = useAnimatedStyle(() => ({
      position: "absolute",
      left: 0,
      top: top.value,
    }))
    return (
      <View
        style={{ width: OUTPUT.width, height: OUTPUT.height }}
        testID="stage"
      >
        <View
          style={{
            position: "absolute",
            left: 100,
            top: 100,
            width: 200,
            height: 200,
            overflow: "hidden",
            backgroundColor: "#26a269",
          }}
          testID="clip"
        >
          <Animated.View
            style={[{ width: 200, height: 80 }, style]}
            testID="mover"
          >
            <Pressable
              testID="target"
              onPress={() => onInside()}
              style={{ width: 200, height: 80 }}
            />
          </Animated.View>
        </View>
        <Pressable
          testID="elsewhere"
          onPress={() => onElsewhere()}
          style={{
            position: "absolute",
            left: 700,
            top: 500,
            width: 120,
            height: 80,
          }}
        />
      </View>
    )
  }

  await act(async () => {
    await render(
      <Root
        width={OUTPUT.width}
        height={OUTPUT.height}
      >
        <Stage />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(widget("target").getWidth()).toBeGreaterThan(0)
  })
  const root = widget("stage").getRoot()
  if (!(root instanceof Gtk.Window)) {
    throw new Error("no toplevel")
  }
  root.present()
  root.fullscreen()
  await waitFor(() => {
    expect(root.isActive()).toBe(true)
  })
  await settle()

  const press = async (x: number, y: number): Promise<void> => {
    device.moveTo(x, y)
    await settle()
    device.press()
    await settle()
    device.release()
    await settle()
  }

  // Baseline: inside the clip, it answers where it is drawn.
  await press(160, 140)
  await waitFor(() => {
    expect(onInside).toHaveBeenCalledTimes(1)
  })
  onInside.mockClear()

  // Drive it out of the parent: 260 puts the whole 80px-tall box below the
  // container's bottom edge at 300.
  await act(async () => {
    boxTop!.value = 260
  })
  await settle()
  expect(paintedBounds()).toEqual({ x: 100, y: 100, width: 200, height: 200 })

  // Where it is now ALLOCATED, and where it would be drawn if nothing clipped.
  await press(160, 420)
  expect(onInside).not.toHaveBeenCalled()
  // NEGATIVE CONTROL: it is not still answering from where it used to be
  // either — the silence above is a clip, not a stuck widget.
  await press(160, 140)
  expect(onInside).not.toHaveBeenCalled()
  // UNTOUCHED ZONE: nothing in this sequence went near it…
  expect(onElsewhere).not.toHaveBeenCalled()
  // …and the pointer was live the whole time, so that silence means something.
  await press(760, 540)
  await waitFor(() => {
    expect(onElsewhere).toHaveBeenCalledTimes(1)
  })

  // Bring it back inside and it answers again: the clip is what silenced it.
  await act(async () => {
    boxTop!.value = 0
  })
  await settle()
  await press(160, 140)
  await waitFor(() => {
    expect(onInside).toHaveBeenCalledTimes(1)
  })
})
