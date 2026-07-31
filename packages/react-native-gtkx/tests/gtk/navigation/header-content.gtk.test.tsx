// headerLeft/headerRight host REAL RN content in the HeaderBar through an
// intrinsic-size root: the content's Yoga size becomes the chrome slot size
// (a zero-minimum root would collapse — the pre-006 wall).
import { render, screen, waitFor } from "@gtkx/testing"
import {
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native"
import { useEffect } from "react"
import { expect, it } from "vitest"
import type { Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Text, View } from "../../../src/index"
import { createStackNavigator } from "../../../src/navigation/index"

const Stack = createStackNavigator()

const HomeScreen = () => (
  <View style={{ flex: 1 }}>
    <Text>home body</Text>
  </View>
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
  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{
            headerRight: () => (
              <View style={{ paddingHorizontal: 6 }}>
                <Text>header rn content</Text>
              </View>
            ),
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

it("headerRight renders RN content with a real intrinsic size", async () => {
  await render(
    <Harness
      onRef={() => {
        // The ref itself is unused here — the harness mirrors the other
        // navigation tests.
      }}
    />,
  )
  await waitFor(() => {
    expect(screen.getByText("home body")).toBeTruthy()
    const label = screen.getByText("header rn content") as GtkNs.Label
    // The intrinsic root gave the chrome slot a non-zero size: the label
    // inside it got a real allocation.
    const allocation = label.getAllocation()
    expect(allocation.width).toBeGreaterThan(10)
    expect(allocation.height).toBeGreaterThan(5)
  })
})
