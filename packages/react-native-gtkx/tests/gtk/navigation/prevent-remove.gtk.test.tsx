// gestureEnabled and usePreventRemove drive the page's native can-pop:
// a prevented / gesture-disabled screen cannot be popped by the user (the
// Adwaita back affordances are off), which is why a native pop can never
// race react-navigation state. A programmatic goBack still pops once the
// prevention is lifted.
import { act, render, screen, waitFor } from "@gtkx/testing"
import {
  CommonActions,
  NavigationContainer,
  useNavigationContainerRef,
  usePreventRemove,
} from "@react-navigation/native"
import { useEffect, useState } from "react"
import { expect, it } from "vitest"
import type { Adw, Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import { createStackNavigator } from "../../../src/navigation/index"

const Stack = createStackNavigator()

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

const HomeScreen = () => (
  <View style={{ flex: 1 }}>
    <Text>home body</Text>
  </View>
)

let setGuard: (value: boolean) => void = () => {}

const GuardedScreen = () => {
  const [guarded, setGuarded] = useState(true)
  useEffect(() => {
    setGuard = setGuarded
  }, [])
  usePreventRemove(guarded, () => {})
  return (
    <View style={{ flex: 1 }}>
      <Text>guarded body</Text>
    </View>
  )
}

const Harness = ({
  onRef,
}: {
  onRef: (ref: ReturnType<typeof useNavigationContainerRef>) => void
}) => {
  const navRef = useNavigationContainerRef()
  useEffect(() => {
    onRef(navRef)
  }, [navRef, onRef])
  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
        />
        <Stack.Screen
          name="Guarded"
          component={GuardedScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

it("a prevented route reports canPop false, then pops once the guard lifts", async () => {
  let navRef!: ReturnType<typeof useNavigationContainerRef>
  const { container } = await render(
    <Harness
      onRef={(ref) => {
        navRef = ref
      }}
    />,
  )
  const window = container as GtkNs.Window
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
  })
  const view = findNavigationView(window.getChild())!

  // A ref-based dispatch runs outside any React event handler; the resulting
  // react-navigation state update must be flushed under act() first.
  await act(async () => {
    navRef.dispatch(CommonActions.navigate("Guarded"))
  })
  await waitFor(() => {
    expect(screen.getByText("guarded body")).toBeTruthy()
  })
  // The guarded page blocks the native back affordances.
  await waitFor(() => {
    expect(view.getVisiblePage()?.getCanPop()).toBe(false)
  })

  // Lift the guard → canPop returns → a programmatic goBack pops. setGuard
  // is a setState captured straight off the component (not through a React
  // event), so it needs the same act() flush as the ref.dispatch() above.
  await act(async () => {
    setGuard(false)
  })
  await waitFor(() => {
    expect(view.getVisiblePage()?.getCanPop()).toBe(true)
  })
  await act(async () => {
    navRef.goBack()
  })
  await waitFor(() => {
    expect(view.getVisiblePage()?.getTitle()).toBe("Home")
    expect(screen.queryByText("guarded body")).toBeNull()
  })
})
