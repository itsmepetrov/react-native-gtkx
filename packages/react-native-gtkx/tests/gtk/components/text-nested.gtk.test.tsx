// Nested `<Text>` — a run inside a paragraph, which is how React Native
// marks up an interpolated span:
//
//   <Text>{id} is dropped on <Text style={bold}>{zone}</Text></Text>
//
// This rendered "[object Object] is dropped on [object Object]" until
// `flattenToString` learned to recurse into elements. It was found on screen,
// not here — by porting `react-native-reanimated-dnd`'s example app
// (`examples/reanimated-dnd`), whose DroppedItemsMap screen is exactly that
// markup — which is the reason this file exists: the behaviour was
// DOCUMENTED in docs/api.md ("nested Text elements are concatenated without
// per-span styles") and never tested, so the half that was false went
// unnoticed.
//
// What is asserted is the concatenated text. Per-span STYLING is still not
// reproduced (one GtkLabel, one CSS class) and that half of the doc line is
// still true.
import { render, screen, waitFor } from "@gtkx/testing"
import { expect, it } from "vitest"
import { type Gtk as GtkNs } from "../../../src/gtkx/bridge/index"
import { Root, StyleSheet, Text } from "../../../src/index"

const styles = StyleSheet.create({
  bold: { fontWeight: "bold" },
})

const labelOf = (testID: string): string =>
  (screen.getByName(testID) as GtkNs.Label).getLabel()

it("concatenates the text of nested Text elements", async () => {
  await render(
    <Root
      width={400}
      height={200}
    >
      <Text testID="line">
        <Text style={styles.bold}>map-item-1</Text>
        {" is dropped on "}
        <Text style={styles.bold}>drop-zone-1</Text>
      </Text>
    </Root>,
  )

  await waitFor(() => {
    expect(labelOf("line")).toBe("map-item-1 is dropped on drop-zone-1")
  })
})

it("renders neither true nor false, as RN does", async () => {
  await render(
    <Root
      width={400}
      height={200}
    >
      {/* `{flag && "x"}` yields `false` when flag is false, and a bare
          `{Boolean(x)}` yields `true` — RN renders neither. */}
      <Text testID="booleans">
        {false}
        {"kept"}
        {true}
      </Text>
    </Root>,
  )

  await waitFor(() => {
    expect(labelOf("booleans")).toBe("kept")
  })
})

it("recurses through fragments and arrays the same way", async () => {
  await render(
    <Root
      width={400}
      height={200}
    >
      <Text testID="mixed">
        <>
          {["a", "b"].map((part) => (
            <Text key={part}>{part}</Text>
          ))}
        </>
        {"-"}
        {2}
      </Text>
    </Root>,
  )

  await waitFor(() => {
    expect(labelOf("mixed")).toBe("ab-2")
  })
})
