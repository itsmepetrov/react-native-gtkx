// RN's `zIndex`, measured on the two things it actually means: the order GTK
// paints the children in, and the order it picks them in.
//
// Paint is asserted from `gsk_render_node_write_to_file()` — GSK's own
// serialization of the tree the container produced — and never from a widget
// property or from the order of the child list. A property check would pass
// while nothing reached the paint, which is exactly how the `overflow` bug
// hid (see overflow.gtk.test.tsx, same reasoning, same tool).
//
// Picking is asserted twice: through `gtk_widget_pick()`, the routine real
// input goes through, and through a REAL Wayland pointer, because a raised
// view that draws on top and cannot be clicked is worse than the bug being
// fixed. A Wayland pointer is addressed by POSITION rather than by focus, so
// an untouched zone and a negative control are part of the measurement.
import { readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Gtk } from "../../../src/gtkx/bridge/index"
import { Pressable, Root, Text, View } from "../../../src/index"
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

// Each box is a flat colour, so the paint tree names them without ambiguity:
// GSK writes `color: rgb(r,g,b);` and the ORDER those lines appear in is the
// order they were drawn in.
const COLORS = {
  red: { css: "#e01b24", rgb: "rgb(224,27,36)" },
  green: { css: "#26a269", rgb: "rgb(38,162,105)" },
  blue: { css: "#3584e4", rgb: "rgb(53,132,228)" },
  yellow: { css: "#f6d32d", rgb: "rgb(246,211,45)" },
  purple: { css: "#9141ac", rgb: "rgb(145,65,172)" },
} as const

type ColorName = keyof typeof COLORS

let dumpSeq = 0

/** GSK's own textual serialization of what the deck painted. */
const paintDump = (): string => {
  const snapshot = Gtk.Snapshot.new()
  // Through the PARENT, so the deck's own snapshot vfunc is the one that runs.
  widget("stage").snapshotChild(widget("deck"), snapshot)
  const node = snapshot.toNode()
  if (!node) {
    throw new Error("the deck painted nothing")
  }
  dumpSeq += 1
  const file = join(tmpdir(), `rn-gtkx-zindex-${process.pid}-${dumpSeq}.node`)
  if (!node.writeToFile(file)) {
    throw new Error("could not serialize the render node")
  }
  return readFileSync(file, "utf8")
}

/** The boxes, in the order GTK actually drew them. */
const paintOrder = (): ColorName[] => {
  const dump = paintDump()
  return (Object.keys(COLORS) as ColorName[])
    .map((name) => ({ name, at: dump.indexOf(COLORS[name].rgb) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.name)
}

const pickName = (x: number, y: number): string | null =>
  widget("stage").pick(x, y, Gtk.PickFlags.DEFAULT)?.getName() ?? null

// Three 120x120 boxes in a 300x300 deck, each offset 60px from the last, so
// every neighbouring pair overlaps and red and blue do not touch:
//
//   red    0..120      overlap red/green   60..120
//   green  60..180     overlap green/blue 120..180
//   blue  120..240
//
// The deck sits at (40,40) in the stage, so stage x = deck x + 40.
const box = (name: ColorName, left: number, z?: number) => (
  <View
    key={name}
    testID={name}
    style={{
      position: "absolute",
      left,
      top: 0,
      width: 120,
      height: 120,
      backgroundColor: COLORS[name].css,
      ...(z === undefined ? null : { zIndex: z }),
    }}
  />
)

const stage = (zs: Partial<Record<ColorName, number>> = {}) => (
  <Root
    width={400}
    height={400}
  >
    <View
      style={{ width: 400, height: 400 }}
      testID="stage"
    >
      <View
        testID="deck"
        style={{
          position: "absolute",
          left: 40,
          top: 40,
          width: 300,
          height: 300,
        }}
      >
        {box("red", 0, zs.red)}
        {box("green", 60, zs.green)}
        {box("blue", 120, zs.blue)}
      </View>
    </View>
  </Root>
)

const mount = async (
  zs: Partial<Record<ColorName, number>> = {},
): Promise<void> => {
  await render(stage(zs))
  await waitFor(() => {
    expect(widget("blue").getWidth()).toBeGreaterThan(0)
  })
}

// --- paint ---------------------------------------------------------------

it("without zIndex the last sibling paints on top — GTK's own rule", async () => {
  await mount()
  // The baseline every assertion below is measured against.
  expect(paintOrder()).toEqual(["red", "green", "blue"])
  expect(pickName(100, 100)).toBe("green")
  expect(pickName(160, 100)).toBe("blue")
})

it("a higher zIndex paints above a LATER sibling", async () => {
  await mount({ red: 10 })
  // Red is the FIRST child and is drawn last: the paint order is no longer
  // the child order, which is the whole point.
  expect(paintOrder()).toEqual(["green", "blue", "red"])
})

it("zIndex orders all of a sibling group, not just the raised one", async () => {
  await mount({ red: 3, green: 1, blue: 2 })
  expect(paintOrder()).toEqual(["green", "blue", "red"])
})

it("a negative zIndex paints BELOW an unraised sibling", async () => {
  // RN allows negatives and treats a missing value as 0, so -1 must go under
  // siblings that say nothing at all.
  await mount({ blue: -1 })
  expect(paintOrder()).toEqual(["blue", "red", "green"])
})

it("undefined and 0 are the same value", async () => {
  const { rerender } = await render(stage({ red: 0, green: 0, blue: 0 }))
  await waitFor(() => {
    expect(widget("blue").getWidth()).toBeGreaterThan(0)
  })
  expect(paintOrder()).toEqual(["red", "green", "blue"])
  // A 0 mixed in with two silent siblings sorts the same way.
  await rerender(stage({ green: 0 }))
  await waitFor(() => {
    expect(widget("blue").getWidth()).toBeGreaterThan(0)
  })
  expect(paintOrder()).toEqual(["red", "green", "blue"])
})

it("equal zIndexes keep document order — the sort is stable", async () => {
  // Five siblings on one value: an unstable sort would let them swap between
  // frames, which reads as flicker and is miserable to attribute. Asserted
  // over repeated snapshots, because a single sample cannot tell a stable
  // sort from a lucky one.
  await render(
    <Root
      width={400}
      height={400}
    >
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <View
          testID="deck"
          style={{
            position: "absolute",
            left: 40,
            top: 40,
            width: 300,
            height: 300,
          }}
        >
          {(Object.keys(COLORS) as ColorName[]).map((name, index) =>
            box(name, index * 20, 5),
          )}
        </View>
      </View>
    </Root>,
  )
  await waitFor(() => {
    expect(widget("purple").getWidth()).toBeGreaterThan(0)
  })
  const expected: ColorName[] = ["red", "green", "blue", "yellow", "purple"]
  for (let round = 0; round < 5; round += 1) {
    expect(paintOrder()).toEqual(expected)
  }
})

it("the paint goes back to child order when the zIndex does", async () => {
  const { rerender } = await render(stage({ red: 10 }))
  await waitFor(() => {
    expect(paintOrder()).toEqual(["green", "blue", "red"])
  })
  await rerender(stage())
  await waitFor(() => {
    expect(paintOrder()).toEqual(["red", "green", "blue"])
  })
  await rerender(stage({ red: 10 }))
  await waitFor(() => {
    expect(paintOrder()).toEqual(["green", "blue", "red"])
  })
})

// --- picking agrees with the paint ---------------------------------------

it("pick() follows the paint, not the child order", async () => {
  await mount({ red: 10 })
  // Deck x = stage x - 40. The red/green overlap is deck 60..120.
  expect(pickName(140, 100)).toBe("red")
  // …and the green/blue overlap, which red does not reach, is unaffected:
  // the NEGATIVE CONTROL for the assertion above.
  expect(pickName(200, 100)).toBe("blue")
  // Nor does raising red make it answer where it is not drawn: 220..280 is
  // blue alone, and red stops at 160.
  expect(pickName(250, 100)).toBe("blue")
})

it("a raised view occludes the Text inside a covered sibling", async () => {
  // The hole this is here to close: `gtk_widget_pick()` reaches a child
  // BEFORE it asks the parent's contains(), so a bare GtkLabel inside the
  // covered view would answer for it and the raised view would draw on top
  // and still not be clickable.
  await render(
    <Root
      width={400}
      height={400}
    >
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <View
          testID="deck"
          style={{
            position: "absolute",
            left: 40,
            top: 40,
            width: 300,
            height: 300,
          }}
        >
          <View
            testID="red"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 120,
              height: 120,
              backgroundColor: COLORS.red.css,
              zIndex: 10,
            }}
          />
          <View
            testID="green"
            style={{
              position: "absolute",
              left: 60,
              top: 0,
              width: 120,
              height: 120,
              backgroundColor: COLORS.green.css,
            }}
          >
            <Text
              testID="label"
              style={{ width: 100, height: 20 }}
            >
              zone
            </Text>
          </View>
        </View>
      </View>
    </Root>,
  )
  await waitFor(() => {
    expect(widget("green").getWidth()).toBeGreaterThan(0)
  })
  // The label sits at the top-left of green, i.e. deck 60..160 x 0..20 —
  // inside red, which stops at deck 120.
  expect(pickName(140, 45)).toBe("red")
  // NEGATIVE CONTROL: the same label past red's right edge still answers, so
  // the silence above is occlusion and not a label that went dead.
  expect(pickName(180, 45)).toBe("green")
})

it("unmounting the raised view puts picking back the way it was", async () => {
  // The path that is easy to leak: once nothing in the process is raised the
  // fast path stops asking about paint order at all, so a container that lost
  // its last raised child has to be told on the way DOWN — otherwise the
  // paint-only leaves it excluded from picking stay excluded forever.
  const stage = (raised: boolean) => (
    <Root
      width={400}
      height={400}
    >
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <View
          testID="deck"
          style={{
            position: "absolute",
            left: 40,
            top: 40,
            width: 300,
            height: 300,
          }}
        >
          {raised ? (
            <View
              testID="red"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 120,
                height: 120,
                backgroundColor: COLORS.red.css,
                zIndex: 10,
              }}
            />
          ) : null}
          <View
            testID="green"
            style={{
              position: "absolute",
              left: 60,
              top: 0,
              width: 120,
              height: 120,
              backgroundColor: COLORS.green.css,
            }}
          >
            <Text
              testID="label"
              style={{ width: 100, height: 20 }}
            >
              zone
            </Text>
          </View>
        </View>
      </View>
    </Root>
  )

  const { rerender } = await render(stage(true))
  await waitFor(() => {
    expect(widget("green").getWidth()).toBeGreaterThan(0)
  })
  expect(pickName(140, 45)).toBe("red")
  // The label is excluded from picking while something is raised here.
  expect(pickName(180, 45)).toBe("green")

  await rerender(stage(false))
  await waitFor(() => {
    expect(paintOrder()).toEqual(["green"])
  })
  // …and it is a target again once nothing is.
  expect(pickName(140, 45)).toBe("label")
  expect(pickName(180, 45)).toBe("label")
})

it("a raised view with pointerEvents none does not occlude", async () => {
  // Occlusion is asked as "would GTK have picked anything in that subtree",
  // so RN's own rules come with it: an untargetable overlay paints on top and
  // takes nothing.
  await render(
    <Root
      width={400}
      height={400}
    >
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <View
          testID="deck"
          style={{
            position: "absolute",
            left: 40,
            top: 40,
            width: 300,
            height: 300,
          }}
        >
          <View
            testID="red"
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 120,
              height: 120,
              backgroundColor: COLORS.red.css,
              zIndex: 10,
            }}
          />
          {box("green", 60)}
        </View>
      </View>
    </Root>,
  )
  await waitFor(() => {
    expect(widget("green").getWidth()).toBeGreaterThan(0)
  })
  expect(paintOrder()).toEqual(["green", "red"])
  expect(pickName(140, 100)).toBe("green")
})

// --- an animated zIndex, which is the common case ------------------------

it("an animated zIndex restacks without a React render", async () => {
  // `useSortable` puts zIndex in its style object on every frame; its VALUE
  // changes about twice per drag. Driven here through the same shared value
  // a drag would use, and asserted on the paint tree.
  let raise: SharedValue<number>

  const Stage = () => {
    const z = useSharedValue(0)
    useEffect(() => {
      raise = z
    })
    const style = useAnimatedStyle(() => ({ zIndex: z.value }))
    return (
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <View
          testID="deck"
          style={{
            position: "absolute",
            left: 40,
            top: 40,
            width: 300,
            height: 300,
          }}
        >
          <Animated.View
            testID="red"
            style={[
              {
                position: "absolute",
                left: 0,
                top: 0,
                width: 120,
                height: 120,
                backgroundColor: COLORS.red.css,
              },
              style,
            ]}
          />
          {box("green", 60)}
        </View>
      </View>
    )
  }

  await act(async () => {
    await render(
      <Root
        width={400}
        height={400}
      >
        <Stage />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(widget("green").getWidth()).toBeGreaterThan(0)
  })
  expect(paintOrder()).toEqual(["red", "green"])
  expect(pickName(140, 100)).toBe("green")

  await act(async () => {
    raise!.value = 10
  })
  await settle()
  expect(paintOrder()).toEqual(["green", "red"])
  expect(pickName(140, 100)).toBe("red")

  // …and back down again, which is the other half of a drag.
  await act(async () => {
    raise!.value = 0
  })
  await settle()
  expect(paintOrder()).toEqual(["red", "green"])
  expect(pickName(140, 100)).toBe("green")
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
      console.warn(`[z-index] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

it("a real press lands on the raised view, not the sibling under it", async () => {
  // `gtk_widget_pick()` above is the routine input goes through, but "goes
  // through" is an argument, not a measurement. This drives the same stage
  // with a real Wayland pointer, through the compositor and GDK, on the shape
  // a drag-and-drop library produces: a raised card over a drop zone that has
  // a label in it.
  const device = await withPointer()
  if (!device) {
    return
  }

  const onCard = vi.fn()
  const onZone = vi.fn()
  const onElsewhere = vi.fn()
  let raise: SharedValue<number>

  const Stage = () => {
    const z = useSharedValue(0)
    useEffect(() => {
      raise = z
    })
    const style = useAnimatedStyle(() => ({ zIndex: z.value }))
    return (
      <View
        style={{ width: OUTPUT.width, height: OUTPUT.height }}
        testID="stage"
      >
        <View
          testID="deck"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 600,
            height: 400,
          }}
        >
          {/* the card: FIRST child, so GTK picks it last without a zIndex */}
          <Animated.View
            testID="card"
            style={[
              {
                position: "absolute",
                left: 100,
                top: 100,
                width: 200,
                height: 200,
              },
              style,
            ]}
          >
            <Pressable
              testID="card-press"
              onPress={() => onCard()}
              style={{ width: 200, height: 200 }}
            />
          </Animated.View>
          {/* the drop zone: LATER sibling, with a label inside it */}
          <Pressable
            testID="zone"
            onPress={() => onZone()}
            style={{
              position: "absolute",
              left: 200,
              top: 100,
              width: 300,
              height: 200,
            }}
          >
            <Text
              testID="zone-label"
              style={{ width: 200, height: 24 }}
            >
              drop here
            </Text>
          </Pressable>
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
    expect(widget("zone").getWidth()).toBeGreaterThan(0)
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

  // GTK resolves which widget the pointer is over on crossing and motion
  // events, not on the button press itself, so a press at a coordinate the
  // pointer is ALREADY at would be delivered against the target the last
  // motion computed. Every press here therefore arrives from somewhere else,
  // which is also the only thing a real hand can do.
  const press = async (x: number, y: number): Promise<void> => {
    device.moveTo(900, 700)
    await settle()
    device.moveTo(x, y)
    await settle()
    device.press()
    await settle()
    device.release()
    await settle()
  }

  // Baseline: the overlap is 200..300 x 100..300, and the zone's own label is
  // at 200..400 x 100..124 — inside the overlap. Without a zIndex the LATER
  // sibling wins, which is the bug.
  await press(250, 110)
  await waitFor(() => {
    expect(onZone).toHaveBeenCalledTimes(1)
  })
  expect(onCard).not.toHaveBeenCalled()
  onZone.mockClear()

  // Raise the card, exactly as a drag would.
  await act(async () => {
    raise!.value = 10
  })
  await settle()

  // Over the zone's LABEL, inside the overlap: the card takes it now.
  await press(250, 110)
  await waitFor(() => {
    expect(onCard).toHaveBeenCalledTimes(1)
  })
  expect(onZone).not.toHaveBeenCalled()
  onCard.mockClear()

  // NEGATIVE CONTROL: past the card's right edge the zone still answers, so
  // the zone did not simply go dead.
  await press(400, 200)
  await waitFor(() => {
    expect(onZone).toHaveBeenCalledTimes(1)
  })
  expect(onCard).not.toHaveBeenCalled()
  onZone.mockClear()

  // UNTOUCHED ZONE: nothing above went near it…
  expect(onElsewhere).not.toHaveBeenCalled()
  // …and the pointer was live the whole time, so that silence means something.
  await press(760, 540)
  await waitFor(() => {
    expect(onElsewhere).toHaveBeenCalledTimes(1)
  })

  // Drop it back down and the zone takes the overlap again.
  await act(async () => {
    raise!.value = 0
  })
  await settle()
  await press(250, 110)
  await waitFor(() => {
    expect(onZone).toHaveBeenCalledTimes(1)
  })
  expect(onCard).not.toHaveBeenCalled()
})

// --- the boundary RN draws, spelled out ----------------------------------

it("zIndex is per sibling group: a child cannot rise above its parent's sibling", async () => {
  // RN's rule, and CSS's: `zIndex` orders siblings, it does not create a
  // stacking context that escapes the parent. A very large value on a nested
  // child changes nothing about where its PARENT sits.
  await render(
    <Root
      width={400}
      height={400}
    >
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <View
          testID="deck"
          style={{
            position: "absolute",
            left: 40,
            top: 40,
            width: 300,
            height: 300,
          }}
        >
          <View
            testID="red"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: 120,
              height: 120,
              backgroundColor: COLORS.red.css,
            }}
          >
            <View
              testID="yellow"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 60,
                height: 60,
                backgroundColor: COLORS.yellow.css,
                zIndex: 9999,
              }}
            />
          </View>
          {box("green", 30)}
        </View>
      </View>
    </Root>,
  )
  await waitFor(() => {
    expect(widget("yellow").getWidth()).toBeGreaterThan(0)
  })
  // Red's whole subtree — the 9999 included — is still painted before green.
  expect(paintOrder()).toEqual(["red", "yellow", "green"])
  // Deck (40,40) is inside yellow (0..60) and inside green (30..150): green
  // is the later sibling of yellow's PARENT, so it takes the pick whatever
  // yellow says.
  expect(pickName(80, 80)).toBe("green")
})

it("zIndex applies with any position, unlike CSS's z-index", async () => {
  // CSS ignores `z-index` on a `position: static` box; RN applies it
  // unconditionally. These two are in ordinary flex flow, so they only
  // overlap through a negative margin — but the raise still has to take.
  await render(
    <Root
      width={400}
      height={400}
    >
      <View
        style={{ width: 400, height: 400 }}
        testID="stage"
      >
        <View
          testID="deck"
          style={{ width: 300, height: 300 }}
        >
          <View
            testID="red"
            style={{
              width: 120,
              height: 120,
              backgroundColor: COLORS.red.css,
              zIndex: 1,
            }}
          />
          <View
            testID="green"
            style={{
              width: 120,
              height: 120,
              marginTop: -60,
              backgroundColor: COLORS.green.css,
            }}
          />
        </View>
      </View>
    </Root>,
  )
  await waitFor(() => {
    expect(widget("green").getWidth()).toBeGreaterThan(0)
  })
  expect(paintOrder()).toEqual(["green", "red"])
  // Layout is untouched: green still sits where the negative margin put it,
  // which is what "allocate in Yoga's order, snapshot in zIndex order" means.
  expect(widget("green").getHeight()).toBe(120)
  expect(pickName(50, 80)).toBe("red")
})
