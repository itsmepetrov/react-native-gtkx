// A stack push registers an InteractionManager interaction for the slide's
// duration: runAfterInteractions work scheduled by the pushed screen waits
// until the transition finishes (the fix for content loading mid-animation).
import { render, screen, waitFor } from "@gtkx/testing"
import { useEffect } from "react"
import { afterEach, expect, it, vi } from "vitest"
import {
  InteractionManager,
  resetInteractionManager,
} from "../../../src/apis/interaction-manager"
import { Text, View } from "../../../src/index"
import {
  createStackNavigator,
  NavigationContainer,
  useNavigationContainerRef,
} from "../../../src/navigation/index"

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

it("defers runAfterInteractions work until the push transition ends", async () => {
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

  navRef.navigate("Details" as never)

  // The pushed screen mounts (its content is up immediately)...
  await waitFor(() => {
    expect(screen.getByText("details body")).toBeTruthy()
  })
  // ...but its runAfterInteractions task has NOT run yet — the transition
  // interaction is still open.
  expect(ranOrder).not.toContain("after-interactions")

  // Once the transition-length window elapses, the interaction clears and
  // the deferred work runs.
  await waitFor(
    () => {
      expect(completed).toHaveBeenCalled()
      expect(ranOrder).toContain("after-interactions")
    },
    { timeout: 2000 },
  )
})
