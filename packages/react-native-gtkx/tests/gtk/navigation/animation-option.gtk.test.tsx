// The `animation` screen option collapses to a single boolean on the
// underlying Adw.NavigationView — GTK has exactly one transition style, so
// "none" is the only value that changes anything observable; every other
// value still animates, with the standard Adwaita transition, and a
// specific requested type warns once in development. See docs/api.md and
// the primitive's `animateTransitions` prop (src/common/navigation-stack.tsx).
import { render, screen, waitFor } from "@gtkx/testing"
import {
  CommonActions,
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native"
import { useEffect } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { Adw, Gtk } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import {
  createStackNavigator,
  type StackNavigationOptions,
} from "../../../src/navigation/index"
import { resetIgnoredOptionWarnings } from "../../../src/navigation/option-warnings"

// Same helper as stack.gtk.test.tsx / transition-events.gtk.test.tsx: walks
// the widget tree for the AdwNavigationView instance backing the navigator.
const findNavigationView = (
  widget: Gtk.Widget | null,
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

type ParamList = {
  Home: undefined
  Details: undefined
}

const Stack = createStackNavigator<ParamList>()

const HomeScreen = () => (
  <View style={{ flex: 1 }}>
    <Text>home body</Text>
  </View>
)

const DetailsScreen = () => (
  <View style={{ flex: 1 }}>
    <Text>details body</Text>
  </View>
)

const Harness = ({
  onRef,
  homeOptions,
  detailsOptions,
}: {
  onRef: (ref: ReturnType<typeof useNavigationContainerRef>) => void
  homeOptions?: StackNavigationOptions
  detailsOptions?: StackNavigationOptions
}) => {
  const navRef = useNavigationContainerRef<ParamList>()
  useEffect(() => {
    onRef(navRef)
  }, [navRef, onRef])
  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={homeOptions}
        />
        <Stack.Screen
          name="Details"
          component={DetailsScreen}
          options={detailsOptions}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

beforeEach(() => {
  resetIgnoredOptionWarnings()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

it('animation: "none" on the active screen leaves animate-transitions false on the widget', async () => {
  const { container } = await render(
    <Harness
      onRef={() => {}}
      homeOptions={{ animation: "none" }}
    />,
  )
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
  })
  const view = findNavigationView(container as Gtk.Window)!
  expect(view.getAnimateTransitions()).toBe(false)
})

it("does not warn for animation: none — it is a fully supported value", async () => {
  await render(
    <Harness
      onRef={() => {}}
      homeOptions={{ animation: "none" }}
    />,
  )
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
  })
  expect(console.warn).not.toHaveBeenCalled()
})

it("re-enables animate-transitions when the active screen has no override", async () => {
  let navRef!: ReturnType<typeof useNavigationContainerRef>
  const { container } = await render(
    <Harness
      onRef={(ref) => {
        navRef = ref
      }}
      homeOptions={{ animation: "none" }}
    />,
  )
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
  })
  const view = findNavigationView(container as Gtk.Window)!
  expect(view.getAnimateTransitions()).toBe(false)

  navRef.dispatch(CommonActions.navigate("Details"))
  await waitFor(() => {
    expect(screen.getByText("details body")).toBeTruthy()
  })
  // Details has no `animation` option of its own — the widget-level switch
  // follows the now-active screen, back to Adwaita's own default.
  expect(view.getAnimateTransitions()).toBe(true)
})

it("a specific requested type still animates, and warns once in development", async () => {
  let navRef!: ReturnType<typeof useNavigationContainerRef>
  const { container } = await render(
    <Harness
      onRef={(ref) => {
        navRef = ref
      }}
      detailsOptions={{ animation: "slide_from_bottom" }}
    />,
  )
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
  })
  expect(console.warn).not.toHaveBeenCalled()

  navRef.dispatch(CommonActions.navigate("Details"))
  await waitFor(() => {
    expect(screen.getByText("details body")).toBeTruthy()
  })

  const view = findNavigationView(container as Gtk.Window)!
  // GTK has one style — a specific request still animates with it, it is
  // not silently dropped into "no animation".
  expect(view.getAnimateTransitions()).toBe(true)

  await waitFor(() => {
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
  const [message] = vi.mocked(console.warn).mock.calls[0]!
  expect(message).toContain("animation")
  expect(message).toContain("createStackNavigator")

  // Once per navigator per key, same contract as every other ignored
  // option — a second screen requesting a (different) specific type does
  // not warn again.
  navRef.dispatch(CommonActions.goBack())
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
  })
  navRef.dispatch(CommonActions.navigate("Details"))
  await waitFor(() => {
    expect(screen.getByText("details body")).toBeTruthy()
  })
  expect(console.warn).toHaveBeenCalledTimes(1)
})

it('does not warn for animation: "default" — not a specific request', async () => {
  await render(
    <Harness
      onRef={() => {}}
      homeOptions={{ animation: "default" }}
    />,
  )
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
  })
  expect(console.warn).not.toHaveBeenCalled()
})
