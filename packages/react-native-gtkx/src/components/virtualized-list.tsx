// The windowed list core (RN VirtualizedList model, leaner): only the rows
// around the viewport are mounted; the content View carries the prefix-sum
// height so the ScrollView gets the full range; every mounted cell is
// absolutely positioned at its offset. Heights come from getItemLayout (exact)
// or estimatedItemSize refined by per-cell onLayout; corrections above the
// first visible row are anchored by compensating the scroll offset in the
// same commit (spike/list-window/FINDINGS.md).
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react"
import type { StyleProp } from "../contracts"
import { ActivityIndicator } from "./activity-indicator"
import {
  ScrollView,
  type ScrollEvent,
  type ScrollViewHandle,
  type ScrollViewProps,
} from "./scroll-view"
import type { LayoutEvent } from "./use-layout-child"
import { View } from "./view"

export type ListRenderItemInfo<T> = { item: T; index: number }

export type ItemLayout = { length: number; offset: number; index: number }

// RN FlatList scroll surface on top of ScrollViewHandle. The handle is not
// generic: scrollToItem takes the item as unknown and resolves the index with
// indexOf on the latest data.
export type VirtualizedListHandle = ScrollViewHandle & {
  scrollToIndex(params: {
    index: number
    viewPosition?: number
    animated?: boolean
  }): void
  scrollToItem(params: {
    item: unknown
    viewPosition?: number
    animated?: boolean
  }): void
  scrollToOffset(params: { offset: number; animated?: boolean }): void
}

export type VirtualizedListProps<T> = Omit<ScrollViewProps, "children"> & {
  data: readonly T[]
  renderItem: (info: ListRenderItemInfo<T>) => ReactElement | null
  keyExtractor?: (item: T, index: number) => string
  estimatedItemSize?: number
  getItemLayout?: (data: readonly T[], index: number) => ItemLayout
  // Overscan in viewport multiples (RN semantics, default 5: two viewports
  // above, two below, one visible).
  windowSize?: number
  initialNumToRender?: number
  extraData?: unknown
  // Presentation-only flip: cells keep their data indices but are laid out
  // from the far end of the content (see the projection math below).
  inverted?: boolean
  // RefreshControl parity. Desktop has no pull gesture: `refreshing` renders
  // a spinner row above the content; `onRefresh` is accepted for RN API
  // compatibility but is never triggered by a gesture — app code must call
  // it itself (e.g. from a toolbar button or a keyboard shortcut).
  refreshing?: boolean
  onRefresh?: () => void
  ItemSeparatorComponent?: ComponentType | null
  ListHeaderComponent?: ComponentType | ReactElement | null
  ListFooterComponent?: ComponentType | ReactElement | null
  ListEmptyComponent?: ComponentType | ReactElement | null
  onEndReached?: () => void
  onEndReachedThreshold?: number
  style?: StyleProp
}

const renderAux = (
  component: ComponentType | ReactElement | null | undefined,
): ReactNode => {
  if (component === null || component === undefined) {
    return null
  }
  if (typeof component === "function") {
    const Aux = component
    return <Aux />
  }
  return component
}

// First index whose offset-end is past `target` (binary search over prefix
// sums; offsets has count+1 entries).
const indexAt = (offsets: number[], target: number): number => {
  let low = 0
  let high = offsets.length - 2
  while (low < high) {
    const mid = (low + high) >> 1
    if (offsets[mid + 1]! <= target) {
      low = mid + 1
    } else {
      high = mid
    }
  }
  return low
}

const VirtualizedListInner = forwardRef(
  <T,>(
    {
      data,
      renderItem,
      keyExtractor,
      estimatedItemSize = 44,
      getItemLayout,
      windowSize = 5,
      initialNumToRender = 10,
      extraData,
      inverted = false,
      refreshing = false,
      onRefresh,
      ItemSeparatorComponent,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
      onEndReached,
      onEndReachedThreshold = 0.1,
      onScroll,
      onLayout,
      horizontal = false,
      ...scrollProps
    }: VirtualizedListProps<T>,
    ref: React.Ref<VirtualizedListHandle>,
  ) => {
    const count = data.length
    const scrollRef = useRef<ScrollViewHandle>(null)

    const measured = useRef<(number | undefined)[]>([])
    const [version, setVersion] = useState(0)
    // Scroll position along the main axis (contentOffset.x when horizontal).
    const scrollY = useRef(0)
    // Viewport extent along the main axis (width when horizontal).
    const viewportH = useRef(0)
    const pendingAnchor = useRef(0)
    // scrollToIndex issued while sizes were still estimates: re-run the
    // positioning once after the remount measures real sizes (≤2 scrollTo
    // corrections in total).
    const pendingScrollIndex = useRef<{
      index: number
      viewPosition: number
      animated?: boolean
    } | null>(null)
    const endReachedForSize = useRef(-1)

    // Prefix sums; rebuilt on any size correction (O(N) — cheap even at
    // 10k, see the spike). getItemLayout skips measuring entirely.
    const offsets = useMemo(() => {
      const out = new Array<number>(count + 1)
      out[0] = 0
      for (let index = 0; index < count; index += 1) {
        const size = getItemLayout
          ? getItemLayout(data, index).length
          : (measured.current[index] ?? estimatedItemSize)
        out[index + 1] = out[index]! + size
      }
      return out
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [count, version, estimatedItemSize, getItemLayout, data])

    // INVERTED PROJECTION. The flip is purely presentational: data index i
    // normally occupies [offsets[i], offsets[i+1]) along the main axis; when
    // inverted it is mirrored around the content extent C = offsets[count],
    // occupying [C - offsets[i+1], C - offsets[i]). So data index 0 sits at
    // the far end of the content and the LAST data index sits at position 0 —
    // at scroll offset 0 an inverted list shows the end of the data.
    const cellStart = (index: number): number =>
      inverted ? offsets[count]! - offsets[index + 1]! : offsets[index]!

    const [range, setRange] = useState(() => ({
      first: 0,
      last: Math.min(count, initialNumToRender) - 1,
    }))

    const updateRange = (): void => {
      const overscan = Math.max(1, (windowSize - 1) / 2) * viewportH.current
      // Window in visual (scroll) coordinates.
      let start = scrollY.current - overscan
      let end = scrollY.current + viewportH.current + overscan
      if (inverted) {
        // Map the visual window back to data-offset space: visual position v
        // covers data offsets C - v (mirror around the extent), so the
        // visual window [start, end] covers data offsets [C - end, C - start].
        const extent = offsets[count]!
        ;[start, end] = [extent - end, extent - start]
      }
      const first = indexAt(offsets, Math.max(0, start))
      const last = Math.min(count - 1, indexAt(offsets, end))
      setRange((current) =>
        current.first === first && current.last === last
          ? current
          : { first, last },
      )
    }

    // Clamp a scroll target to the valid range of the axis.
    const clampOffset = (target: number): number => {
      const max = Math.max(0, offsets[count]! - viewportH.current)
      return Math.min(max, Math.max(0, target))
    }

    // Visual scroll offset that places `index` in the viewport: viewPosition
    // 0 aligns the cell start with the viewport start, 0.5 centers it, 1
    // aligns the cell end with the viewport end.
    const offsetForIndex = (index: number, viewPosition: number): number => {
      const size = offsets[index + 1]! - offsets[index]!
      return clampOffset(
        cellStart(index) - viewPosition * (viewportH.current - size),
      )
    }

    const scrollToAxis = (offset: number, animated?: boolean): void => {
      scrollRef.current?.scrollTo(
        horizontal ? { x: offset, animated } : { y: offset, animated },
      )
    }

    const scrollToIndex = (params: {
      index: number
      viewPosition?: number
      animated?: boolean
    }): void => {
      if (count === 0) {
        return
      }
      const index = Math.min(count - 1, Math.max(0, Math.trunc(params.index)))
      const viewPosition = params.viewPosition ?? 0
      // Without getItemLayout the target may rest on estimates: remember the
      // request so the version effect can re-run the positioning once the
      // remounted cells have measured (the ≤2-corrections convergence).
      pendingScrollIndex.current = getItemLayout
        ? null
        : { index, viewPosition, animated: params.animated }
      scrollToAxis(offsetForIndex(index, viewPosition), params.animated)
    }

    useImperativeHandle(ref, () => ({
      // Any direct scroll cancels a pending scrollToIndex correction.
      scrollTo: (options) => {
        pendingScrollIndex.current = null
        scrollRef.current?.scrollTo(options)
      },
      scrollToEnd: (options) => {
        pendingScrollIndex.current = null
        scrollRef.current?.scrollToEnd(options)
      },
      scrollToOffset: ({ offset, animated }) => {
        pendingScrollIndex.current = null
        scrollToAxis(offset, animated)
      },
      scrollToIndex,
      scrollToItem: ({ item, viewPosition, animated }) => {
        const index = data.indexOf(item as T)
        if (index >= 0) {
          scrollToIndex({ index, viewPosition, animated })
        }
      },
    }))

    // Data changes move the window in BOTH directions: growth from an empty
    // list must extend the initial range, shrinking must clamp it.
    useLayoutEffect(() => {
      updateRange()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [count])

    // Runs right after offsets rebuilt from new measurements. A pending
    // scrollToIndex supersedes anchoring: re-issue the (now refined) target
    // once and stop — this is the second and final correction.
    useLayoutEffect(() => {
      const pending = pendingScrollIndex.current
      if (pending) {
        pendingScrollIndex.current = null
        pendingAnchor.current = 0
        scrollToAxis(
          offsetForIndex(pending.index, pending.viewPosition),
          pending.animated,
        )
        return
      }
      // Anchor: apply the accumulated correction delta right after offsets
      // rebuilt, in the same frame — the viewport does not visually move.
      if (pendingAnchor.current !== 0) {
        const delta = pendingAnchor.current
        pendingAnchor.current = 0
        scrollToAxis(scrollY.current + delta)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [version])

    const onItemLayout = (index: number, size: number): void => {
      if (getItemLayout) {
        return
      }
      const known = measured.current[index] ?? estimatedItemSize
      if (Math.abs(known - size) < 0.5) {
        return
      }
      measured.current[index] = size
      // A size change shifts every cell AFTER the changed one in VISUAL
      // order. Normal: visual order is data order, so cells before the
      // window (index < first) shift the viewport content. Inverted: the
      // projection mirrors visual order, so cells after the window
      // (index > last) sit above the viewport and shift it instead.
      if (inverted ? index > range.last : index < range.first) {
        pendingAnchor.current += size - known
      }
      setVersion((value) => value + 1)
    }

    const handleScroll = (event: ScrollEvent): void => {
      onScroll?.(event)
      scrollY.current = horizontal
        ? event.nativeEvent.contentOffset.x
        : event.nativeEvent.contentOffset.y
      updateRange()
      if (onEndReached) {
        const extent = offsets[count]!
        const threshold =
          viewportH.current * Math.max(0, onEndReachedThreshold ?? 0.1)
        // Distance from the viewport to the DATA end (RN semantics: the end
        // of `data`, not the visual bottom). Normal lists keep the data end
        // at visual position `extent`; the inverted projection places it at
        // visual position 0, so the distance is simply the scroll offset —
        // an inverted list starts AT its data end and may fire immediately.
        const distance = inverted
          ? scrollY.current
          : extent - (scrollY.current + viewportH.current)
        if (extent > 0 && distance <= threshold) {
          if (endReachedForSize.current !== extent) {
            endReachedForSize.current = extent
            onEndReached()
          }
        }
      }
    }

    const handleLayout = (event: LayoutEvent): void => {
      onLayout?.(event)
      viewportH.current = horizontal
        ? event.nativeEvent.layout.width
        : event.nativeEvent.layout.height
      updateRange()
    }

    const cells: ReactNode[] = []
    if (count > 0) {
      const last = Math.min(range.last, count - 1)
      for (let index = range.first; index <= last; index += 1) {
        const item = data[index]!
        const key = keyExtractor ? keyExtractor(item, index) : String(index)
        // Vertical cells stretch across the width and sit at their offset;
        // horizontal cells stretch across the height and take their own
        // width from content (so onLayout can measure it).
        const cellStyle: StyleProp = horizontal
          ? { position: "absolute", left: cellStart(index), top: 0, bottom: 0 }
          : { position: "absolute", left: 0, right: 0, top: cellStart(index) }
        cells.push(
          <View
            key={key}
            style={cellStyle}
            onLayout={(event) =>
              onItemLayout(
                index,
                horizontal
                  ? event.nativeEvent.layout.width
                  : event.nativeEvent.layout.height,
              )
            }
          >
            {renderItem({ item, index })}
            {index < count - 1 && ItemSeparatorComponent ? (
              <ItemSeparatorComponent />
            ) : null}
          </View>,
        )
      }
    }

    // extraData participates in identity so memoized parents re-render rows.
    void extraData
    // Accepted for RN parity only; no desktop gesture ever calls it.
    void onRefresh

    return (
      <ScrollView
        {...scrollProps}
        horizontal={horizontal}
        ref={scrollRef}
        onScroll={handleScroll}
        onLayout={handleLayout}
      >
        {refreshing ? (
          // Desktop RefreshControl: no pull gesture exists, so `refreshing`
          // simply shows an in-flow spinner row above the list content.
          <View style={{ alignItems: "center", padding: 8 }}>
            <ActivityIndicator />
          </View>
        ) : null}
        {renderAux(ListHeaderComponent)}
        {count === 0 && renderAux(ListEmptyComponent)}
        {count > 0 && (
          <View
            style={
              horizontal
                ? { width: offsets[count]! }
                : { height: offsets[count]! }
            }
          >
            {cells}
          </View>
        )}
        {renderAux(ListFooterComponent)}
      </ScrollView>
    )
  },
)
VirtualizedListInner.displayName = "VirtualizedList"

export const VirtualizedList = VirtualizedListInner as <T>(
  props: VirtualizedListProps<T> & { ref?: React.Ref<VirtualizedListHandle> },
) => ReactElement
