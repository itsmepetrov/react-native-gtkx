// `findNodeHandle` and the node handle it returns.
//
// This is a GTK test rather than a unit one because a node handle stands for
// a mounted WIDGET: the whole question is what it resolves to, and there is
// nothing to resolve without a real tree. The four claims are the ones the
// libraries that asked for it depend on —
//
//   - it is a number, and a stable one across re-renders (a
//     `useImperativeHandle` builds a new handle object every render, and
//     `@gorhom/bottom-sheet` compares the id to decide whether its scrollable
//     was replaced);
//   - two different refs onto the same view report the SAME number, which is
//     what "it identifies the view, not the ref" means;
//   - `measureLayout` accepts it, which is what
//     `react-native-draggable-flatlist` does with the one it takes;
//   - it is null for something that is not a mounted host view.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { createRef, useState } from "react"
import { expect, it } from "vitest"
import type { Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import {
  findNodeHandle,
  FlatList,
  Root,
  Text,
  View,
  type FlatListHandle,
  type ViewHandle,
} from "../../../src/index"

const waitForAllocation = async (label: string): Promise<void> => {
  await waitFor(() => {
    const widget = screen.getByText(label) as unknown as GtkNs.Widget
    expect(widget.getAllocatedWidth()).toBeGreaterThan(0)
  })
}

it("returns a number for a mounted view and null for anything else", async () => {
  const box = createRef<ViewHandle>()
  await act(async () => {
    await render(
      <Root
        width={200}
        height={200}
      >
        <View
          ref={box}
          style={{ width: 50, height: 20 }}
        >
          <Text>box</Text>
        </View>
      </Root>,
    )
  })
  await waitForAllocation("box")

  const tag = findNodeHandle(box.current)
  expect(typeof tag).toBe("number")
  expect(tag).toBeGreaterThan(0)

  // RN's own accepted inputs, and its own answers for them.
  expect(findNodeHandle(null)).toBeNull()
  expect(findNodeHandle(undefined)).toBeNull()
  expect(findNodeHandle(tag)).toBe(tag)
  expect(findNodeHandle({ not: "a handle" })).toBeNull()
  expect(findNodeHandle("string")).toBeNull()
})

it("is the same number across a re-render, and for two refs on one view", async () => {
  const first = createRef<ViewHandle>()
  const second = createRef<ViewHandle>()
  let bump: (() => void) | null = null

  const Probe = (): React.ReactNode => {
    const [count, setCount] = useState(0)
    bump = () => {
      setCount((value) => value + 1)
    }
    return (
      <View
        ref={(handle: ViewHandle | null) => {
          first.current = handle
          second.current = handle
        }}
        style={{ width: 40 + count * 0, height: 20 }}
      >
        <Text>probe</Text>
      </View>
    )
  }

  await act(async () => {
    await render(
      <Root
        width={200}
        height={200}
      >
        <Probe />
      </Root>,
    )
  })
  await waitForAllocation("probe")

  const before = findNodeHandle(first.current)
  expect(before).not.toBeNull()
  expect(findNodeHandle(second.current)).toBe(before)

  await act(async () => {
    bump?.()
  })
  expect(findNodeHandle(first.current)).toBe(before)
})

it("measureLayout accepts a node handle as well as a handle object", async () => {
  const outer = createRef<ViewHandle>()
  const inner = createRef<ViewHandle>()

  await act(async () => {
    await render(
      <Root
        width={300}
        height={300}
      >
        <View
          ref={outer}
          style={{ paddingTop: 30, paddingLeft: 15 }}
        >
          <View
            ref={inner}
            style={{ width: 60, height: 20 }}
          >
            <Text>inner</Text>
          </View>
        </View>
      </Root>,
    )
  })
  await waitForAllocation("inner")

  const byObject: number[] = []
  const byTag: number[] = []
  inner.current!.measureLayout(outer.current!, (left, top) => {
    byObject.push(left, top)
  })
  inner.current!.measureLayout(findNodeHandle(outer.current)!, (left, top) => {
    byTag.push(left, top)
  })
  expect(byObject).toEqual([15, 30])
  expect(byTag).toEqual(byObject)
})

it("a windowed list resolves to the ScrollView it renders", async () => {
  // What `@gorhom/bottom-sheet` needs: its scrollables are lists, and a null
  // here is the "Couldn't find the scrollable node handle id!" warning that
  // leaves the sheet with no scrollable bound to it.
  const list = createRef<FlatListHandle>()
  await act(async () => {
    await render(
      <Root
        width={200}
        height={200}
      >
        <FlatList
          ref={list}
          data={["only"]}
          keyExtractor={(item) => item}
          renderItem={({ item }) => <Text>{item}</Text>}
        />
      </Root>,
    )
  })
  await waitForAllocation("only")

  const tag = findNodeHandle(list.current)
  expect(typeof tag).toBe("number")
})
