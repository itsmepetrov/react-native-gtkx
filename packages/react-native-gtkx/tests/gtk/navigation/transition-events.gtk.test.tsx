// transitionStart/transitionEnd: react-navigation compatibility, not our
// own convention (see updates/007/progress.md for the source verification
// against @react-navigation/stack and @react-navigation/native-stack v8,
// neither of which is a dependency here). A route becoming visible (pushed)
// fires `closing: false`; a route leaving the visible stack (popped) fires
// `closing: true`; a route whose visibility never changes — the screen
// covered by a push, or the screen revealed by a pop — gets neither event,
// matching upstream's per-card behavior exactly.
import { act, render, screen, waitFor } from "@gtkx/testing"
import {
  CommonActions,
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native"
import { useEffect } from "react"
import { afterEach, expect, it } from "vitest"
import type { Adw } from "../../../src/gtkx/bridge/adw"
import type { Gtk } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import {
  createStackNavigator,
  type StackScreenProps,
} from "../../../src/navigation/index"

// Walks the widget tree for the AdwNavigationView instance — the same
// object the Adwaita back button pops. Same helper as stack.gtk.test.tsx.
const findNavigationView = (
  widget: Gtk.Widget | null,
): Adw.NavigationView | null => {
  if (!widget) {
    return null
  }
  if (
    typeof (widget as unknown as Partial<Adw.NavigationView>).pushByTag ===
    "function"
  ) {
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

type TransitionEvent = {
  type: "transitionStart" | "transitionEnd"
  closing: boolean
}

const homeEvents: TransitionEvent[] = []
const detailsEvents: TransitionEvent[] = []

const listen = (
  navigation: StackScreenProps<ParamList, "Home" | "Details">["navigation"],
  log: TransitionEvent[],
): (() => void) => {
  const unsubStart = navigation.addListener("transitionStart", (e) => {
    log.push({ type: "transitionStart", closing: e.data.closing })
  })
  const unsubEnd = navigation.addListener("transitionEnd", (e) => {
    log.push({ type: "transitionEnd", closing: e.data.closing })
  })
  return () => {
    unsubStart()
    unsubEnd()
  }
}

const HomeScreen = ({ navigation }: StackScreenProps<ParamList, "Home">) => {
  useEffect(() => listen(navigation, homeEvents), [navigation])
  return (
    <View style={{ flex: 1 }}>
      <Text>home body</Text>
    </View>
  )
}

const DetailsScreen = ({
  navigation,
}: StackScreenProps<ParamList, "Details">) => {
  useEffect(() => listen(navigation, detailsEvents), [navigation])
  return (
    <View style={{ flex: 1 }}>
      <Text>details body</Text>
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
          name="Details"
          component={DetailsScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

afterEach(() => {
  homeEvents.length = 0
  detailsEvents.length = 0
})

it("emits transitionStart/transitionEnd with react-navigation's own payload shape, only to involved routes", async () => {
  let navRef!: ReturnType<typeof useNavigationContainerRef>
  await render(
    <Harness
      onRef={(ref) => {
        navRef = ref
      }}
    />,
  )
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
  })

  // No transition for the initial screen appearing — matches
  // NavigationStack's own primitive behavior (first mount is not an
  // animated push).
  expect(homeEvents).toHaveLength(0)

  // A ref-based dispatch runs outside any React event handler; the resulting
  // react-navigation state update must be flushed under act() before
  // asserting on it.
  await act(async () => {
    navRef.dispatch(CommonActions.navigate("Details"))
  })
  await waitFor(() => {
    expect(screen.getByText("details body")).toBeTruthy()
  })

  // Push: Details is opening. Home is covered but never unmounts, so it
  // gets nothing at all — not even after the transition settles.
  await waitFor(
    () => {
      expect(detailsEvents).toEqual([
        { type: "transitionStart", closing: false },
        { type: "transitionEnd", closing: false },
      ])
    },
    { timeout: 2000 },
  )
  expect(homeEvents).toHaveLength(0)

  await act(async () => {
    navRef.goBack()
  })
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
    expect(screen.queryByText("details body")).toBeNull()
  })

  // Pop: Details is closing. Home is revealed but was never actually
  // removed from the tree, so — matching upstream — it still gets nothing.
  await waitFor(
    () => {
      expect(detailsEvents).toEqual([
        { type: "transitionStart", closing: false },
        { type: "transitionEnd", closing: false },
        { type: "transitionStart", closing: true },
        { type: "transitionEnd", closing: true },
      ])
    },
    { timeout: 2000 },
  )
  expect(homeEvents).toHaveLength(0)
})

it("fires neither event for a native pop — documented limitation, not a stray transitionEnd", async () => {
  let navRef!: ReturnType<typeof useNavigationContainerRef>
  const { container } = await render(
    <Harness
      onRef={(ref) => {
        navRef = ref
      }}
    />,
  )
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
  })
  const window = container as Gtk.Window
  const view = findNavigationView(window.getChild())!

  // A real push, same as the other test — Details gets its normal pair.
  await act(async () => {
    navRef.dispatch(CommonActions.navigate("Details"))
  })
  await waitFor(
    () => {
      expect(detailsEvents).toEqual([
        { type: "transitionStart", closing: false },
        { type: "transitionEnd", closing: false },
      ])
    },
    { timeout: 2000 },
  )
  detailsEvents.length = 0

  // Native pop: what the Adwaita back button does, exactly as
  // stack.gtk.test.tsx's own "native pop drives state" case simulates it —
  // NOT a navigation.dispatch() call. react-navigation state follows (via
  // handlePopped -> StackActions.pop()), but no beginTransition() is ever
  // called for it (see the primitive: handlePopped already reconciles
  // syncedRef, so the sync effect that re-examines `stack` afterward finds
  // nothing left to push or pop) — so neither transitionStart nor
  // transitionEnd should fire, on either screen, at any point.
  // A native pop, like the ref.dispatch() above, drives react-navigation
  // state from outside React's knowledge — same act() requirement.
  await act(async () => {
    view.pop()
  })
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
    expect(screen.queryByText("details body")).toBeNull()
  })
  // Give the primitive's own retention timer (400ms default) room to have
  // fired handlePageClosed for the popped tag, in case the guard were ever
  // accidentally removed.
  await new Promise((resolve) => setTimeout(resolve, 600))
  expect(detailsEvents).toHaveLength(0)
  expect(homeEvents).toHaveLength(0)
})
