// Rig for measuring the REAL react-native-reanimated-dnd package's `Sortable`
// reorder threshold directly, for attribution — kept (not deleted) as the
// scaffolding for that measurement, per the task's evidence-base
// requirement. Was `.skip`ped and named `.rig.tsx` (out of the vitest glob)
// for a real bug that turned out to be OURS, not @gtkx/testing's:
//
// Mounting the real package's `Sortable` under `@gtkx/testing`'s `render()`
// threw "react-native-gtkx components must be rendered inside AppRegistry
// .runApplication() or a <Root>" from deep inside
// `Animated.createAnimatedComponent(...)`, even though the render IS wrapped
// in a `<Root>`. Root cause: the gtk vitest project's OWN aliasing was
// internally inconsistent. `vitest.config.ts` pins the bare specifier
// "react-native" straight at this package's `src/index.ts` (so gtk tests
// exercise source, not a built `dist`), but left every OTHER package this
// platform aliases (`react-native-reanimated`, `-gesture-handler`, `-svg`,
// `-worklets`, `-reanimated-dnd`) to `reactNativeGtkx()`'s own resolution,
// which rewrites them onto `react-native-gtkx/<subpath>` and resolves THAT
// through node_modules — i.e. through this package's own `exports` map,
// which (this package ships compiled) points at `dist`. A real npm
// package's bare `import Animated from "react-native-reanimated"` therefore
// loaded `dist`, while this file's `<Root>` (imported relatively) stayed on
// `src` — two separate `createContext()` calls for `HostNodeContext`
// (components/host-node.ts), Provider from one copy, `useContext` from the
// other. Proved without this package at all: a scratch test importing
// `createAnimatedComponent` once relatively and once through the bare
// "react-native-reanimated" specifier got two DIFFERENT function identities
// for the same export, and only the bare-specifier route threw. Every
// existing gtk test for Animated/GestureDetector reaches them through a
// relative `../../../src/...` import, which is exactly why nothing surfaced
// this until a genuine third-party package (which can only ever use bare
// specifiers) was mounted here for the first time. Fixed in
// `vitest.config.ts`: every package name the platform's alias table
// declares now has its own gtk-project `resolve.alias` entry pointing at
// its `src` entry point, matching what "react-native" already had — with a
// config-time check that a name missing its entry throws immediately,
// rather than reproducing this silently.
//
// The file was ALSO renamed `.rig.tsx` on the theory that CI's bare root
// install has no `node_modules/react-native-reanimated-dnd` at all, since
// it "exists only where an example install hoisted it" — checked against
// git history and found to be a mistaken premise, not a real constraint:
// `react-native-reanimated-dnd` has been a dependency of both
// examples/reanimated-dnd (since #63) and examples/gallery (since #91) for
// a long time before this rig existed, and it is a NORMAL, unconditionally
// hoisted npm workspace dependency — nothing example-specific about it. A
// plain root `npm install` (exactly what `.github/workflows/ci.yml` runs)
// installs it, confirmed by a fresh install in a throwaway worktree with no
// example-specific install step of its own. The import is still guarded
// with a dynamic `import()` below rather than left as a static one, though:
// a STATIC relative import into node_modules throws at collection time if
// the module is ever genuinely absent (a filtered/workspace-scoped install,
// a future prune), and that failure mode — one file, zero tests, no skip
// reason printed — is worse than a graceful skip. Guard the import, don't
// hide the file.
import { act, cleanup, render, screen, waitFor } from "@gtkx/testing"
import { afterEach, expect, it } from "vitest"
// Type-only: erased at runtime, so it cannot reintroduce the collection-time
// crash a missing package would cause — but still typechecked, so the two
// component types below stay honest.
import type {
  Sortable as RealSortable,
  SortableItem as RealSortableItem,
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

// A relative path into node_modules on purpose — it bypasses the
// "react-native-reanimated-dnd" -> "react-native-gtkx/dnd" alias, which only
// matches the bare specifier. See the header comment. Dynamic and guarded:
// an environment that genuinely lacks the package (see header) skips this
// test with a clear reason instead of failing collection for the whole file.
const loadRealSortable = async (): Promise<{
  Sortable: typeof RealSortable
  SortableItem: typeof RealSortableItem
} | null> => {
  try {
    return await import("../../../../../node_modules/react-native-reanimated-dnd/lib/index.js")
  } catch (error) {
    console.warn(
      `[measure-real] skipped: react-native-reanimated-dnd is not installed (${String(error)}). ` +
        "Install it — any workspace example that depends on it, e.g. examples/reanimated-dnd or " +
        "examples/gallery, hoists it — before running this rig.",
    )
    return null
  }
}

type Row = { id: string }
const ROWS: Row[] = ["a", "b", "c", "d", "e"].map((id) => ({ id }))

it("mounts the REAL Sortable", async () => {
  const real = await loadRealSortable()
  if (!real) {
    return
  }
  const { Sortable, SortableItem } = real

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
  // Not `getByName`/`testID`: the real `SortableItem` does not forward
  // arbitrary props (including `testID`) onto the view it renders, so the
  // only observable identity for a row is the text this rig's own
  // `renderItem` puts inside it.
  await waitFor(() => {
    expect(screen.getByText("c")).toBeTruthy()
  })
})
