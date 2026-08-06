import { Root, useWindowDimensions } from "react-native"
import { render, renderHookWithWindow, screen } from "react-native-gtkx/testing"
import { expect, it } from "vitest"
import { App } from "../src/App"

it("renders the template's default screen", async () => {
  // react-native-gtkx components need a layout root — AppRegistry.runApplication()
  // in the real app, <Root> in a test (see docs/guide/toolchains.md#testing).
  await render(
    <Root
      width={800}
      height={600}
    >
      <App />
    </Root>,
  )
  expect(screen.getByText("Hello, react-native-gtkx!")).toBeTruthy()
})

it("useWindowDimensions reads the harness window through renderHookWithWindow", async () => {
  const { result } = await renderHookWithWindow(() => useWindowDimensions())
  expect(result.current.width).toBeGreaterThan(0)
  expect(result.current.height).toBeGreaterThan(0)
})
