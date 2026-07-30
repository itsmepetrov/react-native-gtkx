// The windowed list core (RN VirtualizedList model, leaner): only the rows
// around the viewport are mounted; the content View carries the prefix-sum
// height so the ScrollView gets the full range; every mounted cell is
// absolutely positioned at its offset. Heights come from getItemLayout (exact)
// or estimatedItemSize refined by per-cell onLayout; corrections above the
// first visible row are anchored by compensating the scroll offset in the
// same commit (docs/research/list-window.md).
import {
  forwardRef,
  useEffect,
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
import { perfAddTime, perfCount, perfEnabled, perfNow } from "../perf"
import { ActivityIndicator } from "./activity-indicator"
import {
  ScrollView,
  StickySlot,
  type ScrollEvent,
  type ScrollViewHandle,
  type ScrollViewProps,
} from "./scroll-view"
import type { LayoutEvent } from "./use-layout-child"
import { View } from "./view"

export type ListRenderItemInfo<T> = { item: T; index: number }

export type ItemLayout = { length: number; offset: number; index: number }

// RN ViewToken: one entry per item in the viewability report.
export type ViewToken<T = unknown> = {
  item: T
  key: string
  index: number
  isViewable: boolean
}

export type ViewabilityConfig = {
  // Percent (0..100) of the ITEM that must be visible. A fully visible item
  // always counts, even when it covers less than the threshold.
  itemVisiblePercentThreshold?: number
  // Percent (0..100) of the VIEWPORT the item must cover. Takes precedence
  // over itemVisiblePercentThreshold when both are set (RN ViewabilityHelper).
  viewAreaCoveragePercentThreshold?: number
  // The item must stay continuously visible this many ms before it is
  // reported viewable; scrolling out before that cancels the report.
  minimumViewTime?: number
}

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
  // RN inverted semantics: the list opens at the START of the data (visually
  // at the far end — a chat's latest message sits at the bottom), and
  // contentOffset counts from that end. See the projection math below.
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
  onViewableItemsChanged?: (info: {
    viewableItems: ViewToken<T>[]
    changed: ViewToken<T>[]
  }) => void
  viewabilityConfig?: ViewabilityConfig
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

// Perf: counts real React mounts/unmounts of windowed cells (rendered as a
// null child inside each cell only when GTKX_PERF=1).
const CellMountProbe = (): null => {
  useLayoutEffect(() => {
    perfCount("vl.cellMount")
    return () => {
      perfCount("vl.cellUnmount")
    }
  }, [])
  return null
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
      onViewableItemsChanged,
      viewabilityConfig,
      onScroll,
      onContentSizeChange,
      onLayout,
      horizontal = false,
      stickyHeaderIndices,
      ...scrollProps
    }: VirtualizedListProps<T>,
    ref: React.Ref<VirtualizedListHandle>,
  ) => {
    const count = data.length
    const scrollRef = useRef<ScrollViewHandle>(null)

    const measured = useRef<(number | undefined)[]>([])
    const [version, setVersion] = useState(0)
    // Scroll position along the main axis (contentOffset.x when horizontal).
    // Always in RAW adjustment space — all windowing math below is raw.
    const scrollY = useRef(0)
    // Viewport extent along the main axis (width when horizontal).
    const viewportH = useRef(0)
    // RN-space offset for inverted lists. RN's scaleY(-1) flip puts
    // contentOffset 0 at the far (raw) end of the content, so the exposed
    // offset counts from there: exposed = maxRaw - raw. It is the pinned
    // source of truth across content growth — restoring raw from it is what
    // keeps an inverted chat glued to its latest message on prepend.
    const exposedOffset = useRef(0)
    // Main-axis content size as GTK last reported it (the adjustment range).
    // The raw scroll maximum is contentMain - viewport; before the first
    // report it falls back to the list extent (header/footer not yet known).
    const contentMain = useRef(0)
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
    // Currently reported viewable tokens keyed by item key (isViewable true).
    const viewableTokens = useRef(new Map<string, ViewToken<T>>())
    // Items meeting the viewability criteria but still waiting out
    // minimumViewTime; cancelled if they leave the viewport first.
    const viewabilityTimers = useRef(
      new Map<string, ReturnType<typeof setTimeout>>(),
    )
    // Keys whose minimumViewTime elapsed while continuously visible.
    const maturedKeys = useRef(new Set<string>())
    // Timers must call the LATEST closure (data may change while pending).
    const recomputeViewabilityRef = useRef<() => void>(() => {})

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

    // INVERTED PROJECTION. RN implements inverted as a scaleY(-1) flip of
    // the scroller and every cell; the net layout is the data mirrored
    // around the content extent C = offsets[count]: data index i occupies
    // [C - offsets[i+1], C - offsets[i]) in raw scroll space, so data index
    // 0 sits at the far end. The flip also reverses the scroll axis: RN's
    // contentOffset counts from that far end, so the raw GTK offset and the
    // exposed RN offset are complements (exposed = maxRaw - raw).
    const cellStart = (index: number): number =>
      inverted ? offsets[count]! - offsets[index + 1]! : offsets[index]!

    const keyOf = (item: T, index: number): string =>
      keyExtractor ? keyExtractor(item, index) : String(index)

    const [range, setRange] = useState(() => ({
      first: 0,
      last: Math.min(count, initialNumToRender) - 1,
    }))

    const updateRange = (): void => {
      perfCount("vl.updateRange")
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
      setRange((current) => {
        if (current.first === first && current.last === last) {
          return current
        }
        perfCount("vl.rangeChange")
        return { first, last }
      })
    }

    // Clamp a scroll target to the valid range of the axis.
    const clampOffset = (target: number): number => {
      const max = Math.max(0, offsets[count]! - viewportH.current)
      return Math.min(max, Math.max(0, target))
    }

    // Raw scroll maximum along the main axis (adjustment upper - page).
    const maxRawScroll = (): number =>
      Math.max(0, (contentMain.current || offsets[count]!) - viewportH.current)

    // Translate an RN-space main-axis offset into raw adjustment space (and
    // back — the mapping is its own inverse).
    const toRaw = (offset: number): number =>
      Math.max(0, maxRawScroll() - offset)

    // Raw scroll offset that places `index` in the viewport: viewPosition 0
    // aligns the cell start with the viewport start, 0.5 centers it, 1
    // aligns the cell end with the viewport end. Inverted flips which edge
    // viewPosition 0 means: RN computes the target in data space and the
    // scaleY(-1) flip shows it from the other end, so 0 aligns the cell
    // with the visual BOTTOM — in mirrored raw coordinates that is the
    // complementary alignment.
    const offsetForIndex = (index: number, viewPosition: number): number => {
      const size = offsets[index + 1]! - offsets[index]!
      const align = inverted ? 1 - viewPosition : viewPosition
      return clampOffset(cellStart(index) - align * (viewportH.current - size))
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
      // Any direct scroll cancels a pending scrollToIndex correction. The
      // caller always speaks RN-space offsets; inverted translates the main
      // axis into raw adjustment space.
      scrollTo: (options) => {
        pendingScrollIndex.current = null
        const main = horizontal ? options.x : options.y
        if (!inverted || main === undefined) {
          scrollRef.current?.scrollTo(options)
          return
        }
        scrollRef.current?.scrollTo({
          ...options,
          ...(horizontal ? { x: toRaw(main) } : { y: toRaw(main) }),
        })
      },
      scrollToEnd: (options) => {
        pendingScrollIndex.current = null
        // Inverted: the END of the data sits at raw offset 0 (visual top).
        if (inverted) {
          scrollToAxis(0, options?.animated)
          return
        }
        scrollRef.current?.scrollToEnd(options)
      },
      scrollToOffset: ({ offset, animated }) => {
        pendingScrollIndex.current = null
        scrollToAxis(inverted ? toRaw(offset) : offset, animated)
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
      perfCount("vl.versionBump")
      // A size change shifts every cell BEFORE the changed one in visual
      // order — for a normal list that is cells above the window (index <
      // first), compensated by the anchor. Inverted lists skip the anchor
      // entirely: their correction is the exposed-offset restore on the
      // content-size report, which re-pins the view to the far end exactly
      // like RN's flip keeps contentOffset counting from there.
      if (!inverted && index < range.first) {
        pendingAnchor.current += size - known
      }
      setVersion((value) => value + 1)
    }

    // VIEWABILITY. Pure math over the prefix sums — no widget queries. All
    // positions are visual (scroll-space): cellStart already folds in the
    // inverted mirror and scrollY/viewportH track the main axis, so the same
    // code serves normal, inverted, and horizontal lists.
    const recomputeViewability = (): void => {
      if (!onViewableItemsChanged) {
        return
      }
      const viewport = viewportH.current
      const extent = offsets[count] ?? 0
      // Items currently meeting the visibility criteria, in index order.
      const eligible = new Map<string, { item: T; index: number }>()
      if (count > 0 && viewport > 0 && extent > 0) {
        const windowStart = scrollY.current
        const windowEnd = windowStart + viewport
        // Visible data-index range: mirror the visual window into data-offset
        // space when inverted (same mapping as updateRange, zero overscan).
        let start = windowStart
        let end = windowEnd
        if (inverted) {
          ;[start, end] = [extent - end, extent - start]
        }
        const first = indexAt(offsets, Math.max(0, start))
        const last = Math.min(count - 1, indexAt(offsets, end))
        const areaThreshold =
          viewabilityConfig?.viewAreaCoveragePercentThreshold
        const itemThreshold = viewabilityConfig?.itemVisiblePercentThreshold
        for (let index = first; index <= last; index += 1) {
          const length = offsets[index + 1]! - offsets[index]!
          const startPos = cellStart(index)
          const visible =
            Math.min(startPos + length, windowEnd) -
            Math.max(startPos, windowStart)
          if (visible <= 0) {
            continue
          }
          let viewable: boolean
          if (visible >= length) {
            // A fully visible item always counts, even when it covers less
            // than the configured share (RN ViewabilityHelper).
            viewable = true
          } else if (areaThreshold !== undefined) {
            viewable = (100 * visible) / viewport >= areaThreshold
          } else if (itemThreshold !== undefined) {
            viewable = (100 * visible) / length >= itemThreshold
          } else {
            // RN default: any visible pixel counts.
            viewable = true
          }
          if (viewable) {
            const item = data[index]!
            eligible.set(keyOf(item, index), { item, index })
          }
        }
      }
      const minimumViewTime = viewabilityConfig?.minimumViewTime ?? 0
      // Leaving the viewport cancels a pending timer and resets maturity —
      // re-entering restarts the continuous-visibility clock.
      for (const [key, timer] of viewabilityTimers.current) {
        if (!eligible.has(key)) {
          clearTimeout(timer)
          viewabilityTimers.current.delete(key)
        }
      }
      for (const key of maturedKeys.current) {
        if (!eligible.has(key)) {
          maturedKeys.current.delete(key)
        }
      }
      const next = new Map<string, ViewToken<T>>()
      for (const [key, entry] of eligible) {
        if (
          minimumViewTime <= 0 ||
          viewableTokens.current.has(key) ||
          maturedKeys.current.has(key)
        ) {
          next.set(key, {
            item: entry.item,
            key,
            index: entry.index,
            isViewable: true,
          })
        } else if (!viewabilityTimers.current.has(key)) {
          const timer = setTimeout(() => {
            viewabilityTimers.current.delete(key)
            maturedKeys.current.add(key)
            recomputeViewabilityRef.current()
          }, minimumViewTime)
          viewabilityTimers.current.set(key, timer)
        }
      }
      // Emit only when the viewable KEY SET changed: newly-viewable tokens
      // first, then the ones that left (isViewable false), each index-ordered.
      const changed: ViewToken<T>[] = []
      for (const token of next.values()) {
        if (!viewableTokens.current.has(token.key)) {
          changed.push(token)
        }
      }
      for (const token of viewableTokens.current.values()) {
        if (!next.has(token.key)) {
          changed.push({ ...token, isViewable: false })
        }
      }
      // Keep tokens fresh (indices may shift under stable keys) but stay
      // silent while the key set is unchanged.
      viewableTokens.current = next
      if (changed.length === 0) {
        return
      }
      onViewableItemsChanged({ viewableItems: [...next.values()], changed })
    }
    useLayoutEffect(() => {
      recomputeViewabilityRef.current = recomputeViewability
    })

    const maybeFireEndReached = (): void => {
      // Before the first layout the viewport extent is unknown — every
      // trigger path below re-runs once it is.
      if (!onEndReached || viewportH.current <= 0) {
        return
      }
      const extent = offsets[count]!
      const threshold =
        viewportH.current * Math.max(0, onEndReachedThreshold ?? 0.1)
      // Distance from the viewport to the DATA end (RN semantics: the end
      // of `data`, not the visual bottom). Normal lists keep the data end
      // at raw position `extent`; the inverted projection places it at raw
      // position 0 (the visual top), so the distance is simply the raw
      // scroll offset — an inverted chat fires this while scrolling up
      // into its history, which is where "load older" belongs.
      // Content shorter than the viewport has a negative distance, so short
      // lists fire right after the first layout without any scrolling.
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

    const handleScroll = (event: ScrollEvent): void => {
      const raw = horizontal
        ? event.nativeEvent.contentOffset.x
        : event.nativeEvent.contentOffset.y
      scrollY.current = raw
      if (inverted) {
        exposedOffset.current = Math.max(0, maxRawScroll() - raw)
        // The caller sees RN-space offsets: contentOffset 0 is the far end
        // where the data starts (a chat's latest message).
        onScroll?.({
          nativeEvent: {
            ...event.nativeEvent,
            contentOffset: {
              x: horizontal
                ? exposedOffset.current
                : event.nativeEvent.contentOffset.x,
              y: horizontal
                ? event.nativeEvent.contentOffset.y
                : exposedOffset.current,
            },
          },
        })
      } else {
        onScroll?.(event)
      }
      updateRange()
      recomputeViewability()
      maybeFireEndReached()
    }

    const handleLayout = (event: LayoutEvent): void => {
      onLayout?.(event)
      viewportH.current = horizontal
        ? event.nativeEvent.layout.width
        : event.nativeEvent.layout.height
      if (inverted) {
        // The viewport changed under a pinned exposed offset: re-derive the
        // raw position and window against the value we are about to take.
        // Best effort — the adjustment may still clamp against the previous
        // page size; the next content-size report settles it.
        scrollY.current = toRaw(exposedOffset.current)
        scrollToAxis(scrollY.current)
      }
      updateRange()
      // First layout doubles as the initial viewability/end-reached pass.
      recomputeViewability()
      maybeFireEndReached()
    }

    const handleContentSizeChange = (width: number, height: number): void => {
      onContentSizeChange?.(width, height)
      contentMain.current = horizontal ? width : height
      if (!inverted) {
        return
      }
      // The raw scroll range changed under a pinned exposed offset: restore
      // the raw value from it (the adjustment is fresh — GTK emits "changed"
      // only after the allocation that resized it). Content prepended to an
      // inverted chat therefore appears WITHOUT the view moving, exactly
      // like RN's contentOffset staying put under the flip. This also
      // performs the initial positioning: exposed 0 = the data start.
      const raw = toRaw(exposedOffset.current)
      scrollY.current = raw
      scrollToAxis(raw)
      updateRange()
    }

    // Data or measurement changes move content under a static viewport (no
    // scroll event fires): refresh viewability and the end-reached trigger.
    useEffect(() => {
      recomputeViewability()
      maybeFireEndReached()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [offsets])

    // Unmount: cancel every pending minimumViewTime timer.
    useEffect(() => {
      const timers = viewabilityTimers.current
      return () => {
        for (const timer of timers.values()) {
          clearTimeout(timer)
        }
        timers.clear()
      }
    }, [])

    // Sticky cells (vertical, non-inverted): the ACTIVE header must stay
    // mounted even when its own offset left the window — extend the mount
    // set with it; geometry comes from the registry offsets, pinning is the
    // ScrollView registry's job (same mechanism as plain sticky children).
    const stickySorted =
      stickyHeaderIndices && !horizontal && !inverted
        ? [...stickyHeaderIndices].sort((a, b) => a - b)
        : []
    let activeStickyIndex = -1
    for (const stickyIndex of stickySorted) {
      if (stickyIndex < count && cellStart(stickyIndex) <= scrollY.current) {
        activeStickyIndex = stickyIndex
      }
    }

    const renderCell = (index: number): ReactNode => {
      const item = data[index]!
      const key = keyOf(item, index)
      // Vertical cells stretch across the width and sit at their offset;
      // horizontal cells stretch across the height and take their own
      // width from content (so onLayout can measure it).
      const cellStyle: StyleProp = horizontal
        ? { position: "absolute", left: cellStart(index), top: 0, bottom: 0 }
        : { position: "absolute", left: 0, right: 0, top: cellStart(index) }
      const measure = (event: {
        nativeEvent: { layout: { width: number; height: number } }
      }): void =>
        onItemLayout(
          index,
          horizontal
            ? event.nativeEvent.layout.width
            : event.nativeEvent.layout.height,
        )
      const body = (
        <>
          {perfEnabled ? <CellMountProbe /> : null}
          {renderItem({ item, index })}
          {index < count - 1 && ItemSeparatorComponent ? (
            <ItemSeparatorComponent />
          ) : null}
        </>
      )
      if (stickySorted.includes(index)) {
        return (
          <StickySlot
            key={key}
            stickyKey={`cell-${key}`}
            top={cellStart(index)}
            style={cellStyle}
            onLayout={measure}
          >
            {body}
          </StickySlot>
        )
      }
      return (
        <View
          key={key}
          style={cellStyle}
          onLayout={measure}
        >
          {body}
        </View>
      )
    }

    const cells: ReactNode[] = []
    const renderStart = perfEnabled ? perfNow() : 0
    if (count > 0) {
      if (activeStickyIndex >= 0 && activeStickyIndex < range.first) {
        cells.push(renderCell(activeStickyIndex))
      }
      const last = Math.min(range.last, count - 1)
      for (let index = range.first; index <= last; index += 1) {
        cells.push(renderCell(index))
      }
    }
    if (perfEnabled) {
      // Element construction only — reconciliation and host mutations happen
      // inside React afterwards; those are visible in engine.flush and the
      // mount counters instead.
      perfAddTime("vl.renderCells", perfNow() - renderStart)
      perfCount("vl.render")
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
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
      >
        {refreshing ? (
          // Desktop RefreshControl: no pull gesture exists, so `refreshing`
          // simply shows an in-flow spinner row above the list content.
          <View style={{ alignItems: "center", padding: 8 }}>
            <ActivityIndicator />
          </View>
        ) : null}
        {/* RN's flip mirrors the chrome too: on an inverted list the footer
            sits at the visual top and the header at the visual bottom. */}
        {renderAux(inverted ? ListFooterComponent : ListHeaderComponent)}
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
        {renderAux(inverted ? ListHeaderComponent : ListFooterComponent)}
      </ScrollView>
    )
  },
)
VirtualizedListInner.displayName = "VirtualizedList"

export const VirtualizedList = VirtualizedListInner as <T>(
  props: VirtualizedListProps<T> & { ref?: React.Ref<VirtualizedListHandle> },
) => ReactElement
