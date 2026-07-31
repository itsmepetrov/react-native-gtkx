// A stack push registers an InteractionManager interaction for the slide's
// duration: runAfterInteractions work scheduled by the pushed screen waits
// until the transition finishes (the fix for content loading mid-animation).
import { act, render, screen, waitFor } from "@gtkx/testing"
import {
  CommonActions,
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native"
import { useEffect } from "react"
import { afterEach, expect, it, vi } from "vitest"
import {
  InteractionManager,
  resetInteractionManager,
} from "../../../src/apis/interaction-manager"
import { Text, View } from "../../../src/index"
import { createStackNavigator } from "../../../src/navigation/index"

const Stack = createStackNavigator()

const ranOrder: string[] = []

const HomeScreen = () => (
  <View style={{ flex: 1 }}>
    <Text>home body</Text>
  </View>
)

const DetailsScreen = () => {
  useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(() => {
      ranOrder.push("after-interactions")
    })
    return () => interaction.cancel()
  }, [])
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
  ranOrder.length = 0
  resetInteractionManager()
})

it("defers runAfterInteractions work until the push transition ends, closing on the real signal rather than the transitionDuration guess", async () => {
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

  const completed = vi.fn()
  InteractionManager.addListener("interactionComplete", completed)

  const dispatchedAt = performance.now()
  // A ref-based dispatch runs outside any React event handler; the resulting
  // react-navigation state update must be flushed under act() before
  // asserting on it.
  await act(async () => {
    navRef.dispatch(CommonActions.navigate("Details"))
  })

  // The pushed screen mounts...
  await waitFor(() => {
    expect(screen.getByText("details body")).toBeTruthy()
  })

  // ...and its runAfterInteractions task eventually runs, gated by the
  // interaction the transition opened.
  await waitFor(
    () => {
      expect(completed).toHaveBeenCalled()
      expect(ranOrder).toContain("after-interactions")
    },
    { timeout: 2000 },
  )

  // The important regression guard: the interaction closes on
  // AdwNavigationPage's real "shown" signal, not a blind wait for the
  // default 400 ms `transitionDuration`. A generous fraction of that
  // default is still a tight bound — measured on the project's own
  // headless GTK rig, the real signal arrives in single-digit
  // milliseconds (see updates/002/progress.md) — and this would have
  // failed under the old timer-only mechanism, which always took the
  // full 400 ms regardless of how fast the transition actually settled.
  const elapsed = performance.now() - dispatchedAt
  expect(elapsed).toBeLessThan(200)
})
