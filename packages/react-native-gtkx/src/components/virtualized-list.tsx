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
import type { StyleProp } from "../contracts.js"
import {
  ScrollView,
  type ScrollEvent,
  type ScrollViewHandle,
  type ScrollViewProps,
} from "./scroll-view.js"
import type { LayoutEvent } from "./use-layout-child.js"
import { View } from "./view.js"

export type ListRenderItemInfo<T> = { item: T; index: number }

export type ItemLayout = { length: number; offset: number; index: number }

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
      ItemSeparatorComponent,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
      onEndReached,
      onEndReachedThreshold = 0.1,
      onScroll,
      onLayout,
      ...scrollProps
    }: VirtualizedListProps<T>,
    ref: React.Ref<ScrollViewHandle>,
  ) => {
    const count = data.length
    const scrollRef = useRef<ScrollViewHandle>(null)
    useImperativeHandle(ref, () => scrollRef.current!, [])

    const measured = useRef<(number | undefined)[]>([])
    const [version, setVersion] = useState(0)
    const scrollY = useRef(0)
    const viewportH = useRef(0)
    const pendingAnchor = useRef(0)
    const endReachedForSize = useRef(-1)

    // Prefix sums; rebuilt on any height correction (O(N) — cheap even at
    // 10k, see the spike). getItemLayout skips measuring entirely.
    const offsets = useMemo(() => {
      const out = new Array<number>(count + 1)
      out[0] = 0
      for (let index = 0; index < count; index += 1) {
        const height = getItemLayout
          ? getItemLayout(data, index).length
          : (measured.current[index] ?? estimatedItemSize)
        out[index + 1] = out[index]! + height
      }
      return out
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [count, version, estimatedItemSize, getItemLayout, data])

    const [range, setRange] = useState(() => ({
      first: 0,
      last: Math.min(count, initialNumToRender) - 1,
    }))

    const updateRange = (): void => {
      const overscan = Math.max(1, (windowSize - 1) / 2) * viewportH.current
      const first = indexAt(offsets, Math.max(0, scrollY.current - overscan))
      const last = Math.min(
        count - 1,
        indexAt(offsets, scrollY.current + viewportH.current + overscan),
      )
      setRange((current) =>
        current.first === first && current.last === last
          ? current
          : { first, last },
      )
    }

    // Data changes move the window in BOTH directions: growth from an empty
    // list must extend the initial range, shrinking must clamp it.
    useLayoutEffect(() => {
      updateRange()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [count])

    // Anchor: apply the accumulated correction delta right after offsets
    // rebuilt, in the same frame — the viewport does not visually move.
    useLayoutEffect(() => {
      if (pendingAnchor.current !== 0) {
        const delta = pendingAnchor.current
        pendingAnchor.current = 0
        scrollRef.current?.scrollTo({ y: scrollY.current + delta })
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [version])

    const onItemLayout = (index: number, height: number): void => {
      if (getItemLayout) {
        return
      }
      const known = measured.current[index] ?? estimatedItemSize
      if (Math.abs(known - height) < 0.5) {
        return
      }
      measured.current[index] = height
      if (index < range.first) {
        pendingAnchor.current += height - known
      }
      setVersion((value) => value + 1)
    }

    const handleScroll = (event: ScrollEvent): void => {
      onScroll?.(event)
      scrollY.current = scrollProps.horizontal
        ? event.nativeEvent.contentOffset.x
        : event.nativeEvent.contentOffset.y
      updateRange()
      if (onEndReached) {
        const extent = offsets[count]!
        const threshold =
          viewportH.current * Math.max(0, onEndReachedThreshold ?? 0.1)
        if (
          extent > 0 &&
          scrollY.current + viewportH.current >= extent - threshold
        ) {
          if (endReachedForSize.current !== extent) {
            endReachedForSize.current = extent
            onEndReached()
          }
        }
      }
    }

    const handleLayout = (event: LayoutEvent): void => {
      onLayout?.(event)
      viewportH.current = scrollProps.horizontal
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
        cells.push(
          <View
            key={key}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: offsets[index]!,
            }}
            onLayout={(event) =>
              onItemLayout(index, event.nativeEvent.layout.height)
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

    return (
      <ScrollView
        {...scrollProps}
        ref={scrollRef}
        onScroll={handleScroll}
        onLayout={handleLayout}
      >
        {renderAux(ListHeaderComponent)}
        {count === 0 && renderAux(ListEmptyComponent)}
        {count > 0 && <View style={{ height: offsets[count]! }}>{cells}</View>}
        {renderAux(ListFooterComponent)}
      </ScrollView>
    )
  },
)
VirtualizedListInner.displayName = "VirtualizedList"

export const VirtualizedList = VirtualizedListInner as <T>(
  props: VirtualizedListProps<T> & { ref?: React.Ref<ScrollViewHandle> },
) => ReactElement
