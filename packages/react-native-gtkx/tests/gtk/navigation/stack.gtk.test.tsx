// createStackNavigator (react-native-gtkx/navigation): react-navigation
// state drives Adw.NavigationView pages, and NATIVE pops (the Adwaita back
// button — simulated here by calling pop() on the widget, exactly what the
// button does) flow back into react-navigation state.
import { act, render, screen, waitFor } from "@gtkx/testing"
import {
  CommonActions,
  NavigationContainer,
  useNavigation,
  useNavigationContainerRef,
  useRoute,
} from "@react-navigation/native"
import { useEffect } from "react"
import { expect, it } from "vitest"
import type { Adw } from "../../../src/gtkx/bridge/adw"
import type { Gtk } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import { createStackNavigator } from "../../../src/navigation/index"

const Stack = createStackNavigator()

// Walks the widget tree for the AdwNavigationView instance — the same
// object the Adwaita back button pops.
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

const HomeScreen = () => {
  // The hooks must work inside screens — their use IS the assertion.
  const route = useRoute()
  useNavigation()
  return (
    <View style={{ flex: 1 }}>
      <Text>{`home screen (route ${route.name})`}</Text>
    </View>
  )
}

const DetailsScreen = () => {
  const route = useRoute()
  return (
    <View style={{ flex: 1 }}>
      <Text>{`details screen (route ${route.name})`}</Text>
    </View>
  )
}

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

it("navigate/goBack drive the NavigationView and a native pop drives state", async () => {
  let navRef!: ReturnType<typeof useNavigationContainerRef>
  const { container } = await render(
    <Harness
      onRef={(ref) => {
        navRef = ref
      }}
    />,
  )
  const window = container as Gtk.Window

  // Initial: the Home screen is mounted and visible; hooks resolved.
  await waitFor(() => {
    expect(screen.getByText("home screen (route Home)")).toBeTruthy()
  })
  const view = findNavigationView(window.getChild())
  expect(view).not.toBeNull()

  // navigate → the view pushes the Details page; the page carries the
  // options title and the route key tag. A ref-based dispatch runs outside
  // any React event handler, so the state update needs act() to flush
  // before asserting on it.
  await act(async () => {
    navRef.dispatch(CommonActions.navigate("Details"))
  })
  await waitFor(() => {
    expect(screen.getByText("details screen (route Details)")).toBeTruthy()
    const visible = view!.getVisiblePage()
    expect(visible?.getTitle()).toBe("Details page")
  })

  // goBack → the view pops back to Home; Details unmounts with its route.
  await act(async () => {
    navRef.goBack()
  })
  await waitFor(() => {
    const visible = view!.getVisiblePage()
    expect(visible?.getTitle()).toBe("Home")
    expect(screen.queryByText("details screen (route Details)")).toBeNull()
  })

  // Push again, then pop NATIVELY (what the HeaderBar back button does):
  // react-navigation state must follow — the Details route unmounts.
  await act(async () => {
    navRef.dispatch(CommonActions.navigate("Details"))
  })
  await waitFor(() => {
    expect(view!.getVisiblePage()?.getTitle()).toBe("Details page")
  })
  // The native pop drives react-navigation state from outside React's
  // knowledge, same act() requirement as the ref-based calls above.
  await act(async () => {
    view!.pop()
  })
  await waitFor(() => {
    expect(view!.getVisiblePage()?.getTitle()).toBe("Home")
    expect(screen.queryByText("details screen (route Details)")).toBeNull()
    expect(navRef.getRootState()?.routes).toHaveLength(1)
  })
})

it("push stacks duplicate routes and pops unwind them one by one", async () => {
  let navRef!: ReturnType<typeof useNavigationContainerRef>
  await render(
    <Harness
      onRef={(ref) => {
        navRef = ref
      }}
    />,
  )
  await waitFor(() => {
    expect(screen.getByText("home screen (route Home)")).toBeTruthy()
  })

  // Both PUSH dispatches run outside any React event handler, back to back
  // with no assertion between them — one act() flush covers both.
  await act(async () => {
    navRef.dispatch({
      type: "PUSH",
      payload: { name: "Details" },
    })
    navRef.dispatch({
      type: "PUSH",
      payload: { name: "Details" },
    })
  })
  await waitFor(() => {
    expect(navRef.getRootState()?.routes).toHaveLength(3)
  })

  await act(async () => {
    navRef.goBack()
  })
  await waitFor(() => {
    expect(navRef.getRootState()?.routes).toHaveLength(2)
    expect(screen.getByText("details screen (route Details)")).toBeTruthy()
  })
  await act(async () => {
    navRef.goBack()
  })
  await waitFor(() => {
    expect(navRef.getRootState()?.routes).toHaveLength(1)
    expect(screen.queryByText("details screen (route Details)")).toBeNull()
  })
})
