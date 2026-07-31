// A list whose rows arrive AFTER mount (the fetch shape every real app has)
// must window against the data it holds now, not the data it had at mount.
// The scroll handler travels to GTK through a signal connection made once, so
// a handler frozen at mount silently windows against count=0 and empties the
// list on the first scroll — see gtkx/bridge/use-signal.ts.
import { act, render, screen, waitFor } from "@gtkx/testing"
import { useEffect, useState } from "react"
import { expect, it } from "vitest"
import {
  FlatList,
  Root,
  Text,
  View,
  type FlatListHandle,
} from "../../../src/index"

const ROWS = Array.from({ length: 40 }, (_, index) => `late-row-${index}`)

it("keeps the window after a scroll when the rows arrived after mount", async () => {
  let handle: FlatListHandle | null = null
  const offsets: number[] = []

  const Fetcher = () => {
    const [data, setData] = useState<string[]>([])
    useEffect(() => {
      const id = setTimeout(() => setData(ROWS), 20)
      return () => clearTimeout(id)
    }, [])
    return (
      <FlatList
        ref={(list) => {
          handle = list
        }}
        style={{ height: 400 }}
        data={data}
        keyExtractor={(item) => item}
        onScroll={(event) => {
          // The reported offset proves the handler ran with live data: an
          // empty list cannot scroll at all.
          offsets.push(event.nativeEvent.contentOffset.y)
        }}
        renderItem={({ item }) => (
          <View style={{ height: 100 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    )
  }

  await render(
    <Root
      width={400}
      height={400}
    >
      <Fetcher />
    </Root>,
  )
  await waitFor(() => {
    expect(screen.getByText("late-row-0")).toBeTruthy()
  })

  // 100px rows: offset 800 puts rows 8..11 in the 400px viewport.
  // act(): scrollToOffset writes the GTK adjustment, whose value-changed
  // signal runs the list's own scroll handler and setRange() synchronously
  // in this same call stack — a state update React does not know it caused.
  await act(async () => {
    handle!.scrollToOffset({ offset: 800, animated: false })
  })

  await waitFor(() => {
    expect(screen.queryByText("late-row-8")).not.toBeNull()
  })
  expect(screen.queryByText("late-row-11")).not.toBeNull()
  expect(offsets.at(-1)).toBeCloseTo(800, 0)
})
