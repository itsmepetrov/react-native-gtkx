// Branch-D input: v1 FlatList renders every row (no virtualization). This
// pins the practical ceiling — full mount+layout of 1000 rows must stay in
// interactive territory; the measured time is logged for the PRD branch D
// record.
import { render, screen } from "@gtkx/testing"
import { expect, it } from "vitest"
import { FlatList, Root, Text, View } from "../../src/index.js"

it("mounts and lays out a 1000-row FlatList", async () => {
  const data = Array.from({ length: 1000 }, (_, i) => `Row #${i + 1}`)
  const started = performance.now()

  await render(
    <Root
      width={400}
      height={600}
    >
      <FlatList
        style={{ height: 500 }}
        data={data}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <View style={{ padding: 4 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </Root>,
  )

  const last = screen.getByText("Row #1000")
  expect(last).toBeTruthy()
  const elapsed = Math.round(performance.now() - started)
  console.warn(`FLATLIST-1000 mount+layout: ${elapsed}ms`)
  expect(elapsed).toBeLessThan(15000)
})
