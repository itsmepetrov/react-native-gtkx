// createStackNavigator (react-native-gtkx/navigation): React Navigation 8
// changed `state.routes` to include preloaded routes alongside the active
// ones (StackRouter's `getStateWithRoutes` concatenates active + retained +
// preloaded, with the visible/focused tail ending at `state.index`). The
// adapter must hand NavigationStack only the visible slice
// (`state.routes.slice(0, state.index + 1)`), or a preloaded screen would
// get pushed onto the widget as if the user had actually navigated to it.
// See src/navigation/index.tsx and updates/002/progress.md.
import { render, screen, waitFor } from "@gtkx/testing"
import { useEffect } from "react"
import { expect, it } from "vitest"
import type { Adw, Gtk } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import {
  createStackNavigator,
  NavigationContainer,
  useNavigationContainerRef,
} from "../../../src/navigation/index"

const Stack = createStackNavigator()

// Walks the widget tree for the AdwNavigationView instance, same as the
// other stack navigator tests.
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

const HomeScreen = () => (
  <View style={{ flex: 1 }}>
    <Text>home screen</Text>
  </View>
)

const DetailsScreen = () => (
  <View style={{ flex: 1 }}>
    <Text>details screen</Text>
  </View>
)

const App = ({
  navRef,
}: {
  navRef: ReturnType<typeof useNavigationContainerRef>
}) => (
  <NavigationContainer ref={navRef}>
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
      />
      <Stack.Screen
        name="Details"
        component={DetailsScreen}
        options={{ title: "Details page" }}
      />
    </Stack.Navigator>
  </NavigationContainer>
)

const Harness = ({
  onRef,
}: {
  onRef: (ref: ReturnType<typeof useNavigationContainerRef>) => void
}) => {
  const navRef = useNavigationContainerRef()
  useEffect(() => {
    onRef(navRef)
  }, [navRef, onRef])
  return <App navRef={navRef} />
}

it("a preloaded route sits in state.routes but never appears as a pushed page", async () => {
  let navRef!: ReturnType<typeof useNavigationContainerRef>
  const { container } = await render(
    <Harness
      onRef={(ref) => {
        navRef = ref
      }}
    />,
  )
  const window = container as Gtk.Window
  await waitFor(() => {
    expect(screen.getByText("home screen")).toBeTruthy()
  })
  const view = findNavigationView(window.getChild())
  expect(view).not.toBeNull()

  // PRELOAD (dispatched directly — there is no typed StackActions.preload
  // helper upstream, see StackRouter's PRELOAD case) adds "Details" to
  // state.routes exactly like the v8 change this test guards against.
  navRef.dispatch({
    type: "PRELOAD",
    payload: { name: "Details" },
  })
  await waitFor(() => {
    expect(navRef.getRootState()?.routes).toHaveLength(2)
  })
  // The route is in state, but the widget must never have pushed it: still
  // showing Home, and the preloaded screen's own content was never
  // rendered as a live page.
  expect(view!.getVisiblePage()?.getTitle()).toBe("Home")
  expect(screen.queryByText("details screen")).toBeNull()

  // A real PUSH of the same route afterwards still works — preloading must
  // not have poisoned the tag or left the widget out of sync.
  navRef.dispatch({
    type: "PUSH",
    payload: { name: "Details" },
  })
  await waitFor(() => {
    expect(screen.getByText("details screen")).toBeTruthy()
    expect(view!.getVisiblePage()?.getTitle()).toBe("Details page")
  })
})
