// `sidebarContent` — the app replaces the whole sidebar pane.
//
// The rung below is `sidebarRow`, which keeps the navigator's list and
// swaps one row. This one hands over the entire body, which means it must
// also hand over the routing: a sidebar you can draw but cannot navigate
// from would be a decoration. So what this pins down is that the pane is
// genuinely the app's — none of the composed rows survive — AND that the
// `jumpTo` handed to it moves navigation state for real.
import { render, screen, waitFor } from "@gtkx/testing"
import { NavigationContainer } from "@react-navigation/native"
import { useEffect, useRef } from "react"
import { expect, it } from "vitest"
import { Text, View } from "../../../src/index"
import { createSidebarNavigator } from "../../../src/navigation/index"

const Sidebar = createSidebarNavigator()

// Fires the handed-over jumpTo once, after the first render.
const Jump = ({
  to,
  jumpTo,
}: {
  to: string
  jumpTo: (name: string) => void
}) => {
  const fired = useRef(false)
  useEffect(() => {
    if (!fired.current) {
      fired.current = true
      jumpTo(to)
    }
  }, [jumpTo, to])
  return null
}

it("hands the whole pane and its routing to the app", async () => {
  render(
    <NavigationContainer>
      <Sidebar.Navigator
        sidebarContent={({ routes, focusedIndex, jumpTo }) => (
          <View>
            {/* Nothing here is one-row-per-screen: a heading the navigator
                knows nothing about, then the app's own controls. */}
            <Text>my own heading</Text>
            <Text>{`focused:${focusedIndex}`}</Text>
            {routes.map((route) => (
              <Text key={route.key}>{`go-${route.title}`}</Text>
            ))}
            {/* Calling the handed-over jumpTo directly, rather than
                simulating a press: what is under test is the routing
                surface the navigator passes out, not RN's own gesture
                handling, which its own tests already cover. */}
            <Jump
              to="Second"
              jumpTo={jumpTo}
            />
          </View>
        )}
      >
        <Sidebar.Screen
          name="First"
          options={{ title: "first" }}
        >
          {() => <Text>first-body</Text>}
        </Sidebar.Screen>
        <Sidebar.Screen
          name="Second"
          options={{ title: "second" }}
        >
          {() => <Text>second-body</Text>}
        </Sidebar.Screen>
      </Sidebar.Navigator>
    </NavigationContainer>,
  )

  await waitFor(() => {
    expect(screen.getByText("my own heading")).toBeTruthy()
  })
  // No assertion on the INITIAL focus here: <Jump> fires on mount, so the
  // pane has already moved to the second route by the time this runs. The
  // focused index is asserted after the jump instead, where it is stable.

  // The composed list is gone — the pane is the app's, not the app's
  // content bolted above ours. The focused route's title survives exactly
  // once, in the content HeaderBar; a composed sidebar row would make two.
  expect(screen.queryByText("go-first")).toBeTruthy()
  expect(screen.getAllByText("second").length).toBe(1)

  // …and the routing handed over actually routes.
  await waitFor(() => {
    expect(screen.getByText("second-body")).toBeTruthy()
  })
  expect(screen.getByText("focused:1")).toBeTruthy()
})
