// The adwaita primitives must work WITHOUT react-navigation — that is the
// whole point of the subpath. This file therefore imports nothing from
// @react-navigation and nothing from src/navigation: the "router" is a
// useState holding tags, exactly as an app or a third-party router would
// drive it.
//
// If this file ever needs a react-navigation import to pass, the layering has
// leaked and the primitive is no longer standalone.
import { act, render, waitFor } from "@gtkx/testing"
import { useEffect, useState } from "react"
import { expect, it } from "vitest"
import {
  NavigationStack,
  NavigationStackPage,
  SlotContent,
} from "../../../src/common"
import type { Adw } from "../../../src/gtkx/bridge/adw"
import type { Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"

const findNavigationView = (
  widget: GtkNs.Widget | null,
): Adw.NavigationView | null => {
  if (!widget) {
    return null
  }
  if (typeof (widget as Partial<Adw.NavigationView>).pushByTag === "function") {
    return widget as Adw.NavigationView
  }
  for (
    let child = widget.getFirstChild();
    child;
    child = child.getNextSibling()
  ) {
    const found = findNavigationView(child)
    if (found) {
      return found
    }
  }
  return null
}

let push: (tag: string) => void = () => {}
const popped: string[] = []

const Demo = () => {
  const [stack, setStack] = useState<string[]>(["home"])
  useEffect(() => {
    push = (tag) => setStack((current) => [...current, tag])
  }, [])
  return (
    <NavigationStack
      stack={stack}
      onPopped={(tag) => {
        popped.push(tag)
        setStack((current) => current.filter((entry) => entry !== tag))
      }}
    >
      <NavigationStackPage
        tag="home"
        title="Home"
      >
        <SlotContent>
          <View style={{ flex: 1 }}>
            <Text>home body</Text>
          </View>
        </SlotContent>
      </NavigationStackPage>
      <NavigationStackPage
        tag="detail"
        title="Detail"
      >
        <SlotContent>
          <View style={{ flex: 1 }}>
            <Text>detail body</Text>
          </View>
        </SlotContent>
      </NavigationStackPage>
    </NavigationStack>
  )
}

it("pushes from plain state and reports a native pop back", async () => {
  popped.length = 0
  const { container } = await render(<Demo />)

  const view = findNavigationView(container)
  expect(view).not.toBeNull()
  expect(view!.getVisiblePage()?.getTag()).toBe("home")

  // State drives the widget: appending a tag pushes the page. `push` is a
  // setState captured straight off Demo (not through a React event handler),
  // so it needs act() to flush before asserting on the widget it drives.
  await act(async () => {
    push("detail")
  })
  await waitFor(() => {
    expect(view!.getVisiblePage()?.getTag()).toBe("detail")
  })

  // The widget pops on its own — this is what the Adwaita back button,
  // Escape and the back gesture all end up calling. The native pop fires
  // onPopped synchronously, which calls setState on Demo — same act() need.
  await act(async () => {
    view!.pop()
  })
  await waitFor(() => {
    expect(popped).toContain("detail")
  })
  // …and the app's own state followed it back down.
  await waitFor(() => {
    expect(view!.getVisiblePage()?.getTag()).toBe("home")
  })
})

it("forwards animateTransitions straight to Adw.NavigationView's own property", async () => {
  const Static = ({ animate }: { animate: boolean }) => (
    <NavigationStack
      stack={["home"]}
      animateTransitions={animate}
    >
      <NavigationStackPage
        tag="home"
        title="Home"
      >
        <SlotContent>
          <View style={{ flex: 1 }}>
            <Text>home body</Text>
          </View>
        </SlotContent>
      </NavigationStackPage>
    </NavigationStack>
  )

  const off = await render(<Static animate={false} />)
  const offView = findNavigationView(off.container)!
  expect(offView.getAnimateTransitions()).toBe(false)

  const on = await render(<Static animate={true} />)
  const onView = findNavigationView(on.container)!
  expect(onView.getAnimateTransitions()).toBe(true)

  // The prop is not just applied at mount — it is a live GObject property,
  // reactive like any other prop this primitive forwards.
  const { rerender, container } = await render(<Static animate={true} />)
  const liveView = findNavigationView(container)!
  expect(liveView.getAnimateTransitions()).toBe(true)
  await rerender(<Static animate={false} />)
  expect(liveView.getAnimateTransitions()).toBe(false)
})
