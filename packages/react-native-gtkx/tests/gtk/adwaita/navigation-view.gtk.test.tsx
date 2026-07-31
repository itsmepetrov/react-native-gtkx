// The adwaita primitives must work WITHOUT react-navigation — that is the
// whole point of the subpath. This file therefore imports nothing from
// @react-navigation and nothing from src/navigation: the "router" is a
// useState holding tags, exactly as an app or a third-party router would
// drive it.
//
// If this file ever needs a react-navigation import to pass, the layering has
// leaked and the primitive is no longer standalone.
import { render, waitFor } from "@gtkx/testing"
import { useEffect, useState } from "react"
import { expect, it } from "vitest"
import {
  AdwNavigationPage,
  AdwNavigationStack,
  PageContent,
} from "../../../src/adwaita"
import type { Adw, Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
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
    <AdwNavigationStack
      stack={stack}
      onPopped={(tag) => {
        popped.push(tag)
        setStack((current) => current.filter((entry) => entry !== tag))
      }}
    >
      <AdwNavigationPage
        tag="home"
        title="Home"
      >
        <PageContent>
          <View style={{ flex: 1 }}>
            <Text>home body</Text>
          </View>
        </PageContent>
      </AdwNavigationPage>
      <AdwNavigationPage
        tag="detail"
        title="Detail"
      >
        <PageContent>
          <View style={{ flex: 1 }}>
            <Text>detail body</Text>
          </View>
        </PageContent>
      </AdwNavigationPage>
    </AdwNavigationStack>
  )
}

it("pushes from plain state and reports a native pop back", async () => {
  popped.length = 0
  const { container } = await render(<Demo />)

  const view = findNavigationView(container)
  expect(view).not.toBeNull()
  expect(view!.getVisiblePage()?.getTag()).toBe("home")

  // State drives the widget: appending a tag pushes the page.
  push("detail")
  await waitFor(() => {
    expect(view!.getVisiblePage()?.getTag()).toBe("detail")
  })

  // The widget pops on its own — this is what the Adwaita back button,
  // Escape and the back gesture all end up calling.
  view!.pop()
  await waitFor(() => {
    expect(popped).toContain("detail")
  })
  // …and the app's own state followed it back down.
  await waitFor(() => {
    expect(view!.getVisiblePage()?.getTag()).toBe("home")
  })
})
