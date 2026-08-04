// Rig for measuring the REAL react-native-reanimated-dnd package's `Sortable`
// reorder threshold directly, for attribution — kept (not deleted) as the
// scaffolding for that measurement, per the task's evidence-base
// requirement, but SKIPPED: mounting the real package's `Sortable` under
// `@gtkx/testing`'s `render()` throws
// "react-native-gtkx components must be rendered inside AppRegistry
// .runApplication() or a <Root>" from a `View` several layers inside
// `Animated.createAnimatedComponent(ScrollView)` (reanimated-compat/
// components/animated.tsx), even though the render IS wrapped in a `<Root>` —
// the same `<Root>` wrapping that renders this platform's OWN mirror
// `Sortable` (collision-thresholds.gtk.test.tsx) without incident. Not
// chased further in this PR: the identical real `Sortable`/`SortableGrid`
// DOES run correctly in a real `gtkx dev`/build (the gallery's "Upstream
// sortables" section, `examples/reanimated-dnd` with `DND_IMPL=real` —
// docs/research/upstream-libraries.md, dnd-differential.md), so this is a
// `@gtkx/testing`-environment-specific gap, not evidence the real package
// cannot run — worth a look on its own if a future task needs an in-process
// real-`Sortable` GTK test.
//
// The attribution this PR needed instead came from reading the CURRENT
// published source directly (`useSortable.js`, `useGridSortable.js`,
// `utils/gridCalculations.js` in node_modules/react-native-reanimated-dnd)
// plus the grid case's own EXISTING real-pointer measurement, done inside a
// live running app rather than this harness
// (docs/research/dnd-hover-flicker.md §5) — see
// docs/research/dnd-collision-feel.md for the full writeup and the numbers.
import { act, cleanup, render, screen, waitFor } from "@gtkx/testing"
import { afterEach, expect, it } from "vitest"
// A relative path into node_modules on purpose — it bypasses the
// "react-native-reanimated-dnd" -> "react-native-gtkx/dnd" alias, which only
// matches the bare specifier. See the header comment.
import {
  Sortable,
  SortableItem,
} from "../../../../../node_modules/react-native-reanimated-dnd/lib/index.js"
import { Root, Text } from "../../../src/index"
import {
  createVirtualPointer,
  VirtualPointerUnavailable,
  type VirtualPointer,
} from "../support/virtual-pointer"

const OUTPUT = { width: 1024, height: 768 }
const ROW_H = 100

let pointer: VirtualPointer | null = null

afterEach(() => {
  pointer?.dispose()
  pointer = null
})

const withPointer = async (): Promise<VirtualPointer | null> => {
  try {
    pointer = await createVirtualPointer(OUTPUT)
    return pointer
  } catch (error) {
    if (error instanceof VirtualPointerUnavailable) {
      console.warn(`[measure-real] skipped: ${error.message}`)
      return null
    }
    throw error
  }
}

type Row = { id: string }
const ROWS: Row[] = ["a", "b", "c", "d", "e"].map((id) => ({ id }))

it.skip("mounts the REAL Sortable — see the file header for the known gap", async () => {
  const device = await withPointer()
  if (!device) {
    return
  }
  await act(async () => {
    await cleanup()
  })

  const Stage = () => (
    <Sortable
      data={ROWS}
      itemHeight={ROW_H}
      itemKeyExtractor={(row: Row) => row.id}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderItem={({ item, id, ...rest }: any) => (
        <SortableItem
          key={id}
          id={id}
          data={item}
          {...rest}
          style={{ height: ROW_H }}
          testID={`real-row-${id}`}
        >
          <Text>{id}</Text>
        </SortableItem>
      )}
    />
  )

  await act(async () => {
    await render(
      <Root
        width={500}
        height={700}
      >
        <Stage />
      </Root>,
    )
  })
  await waitFor(() => {
    expect(screen.getByName("real-row-c")).toBeTruthy()
  })
})
