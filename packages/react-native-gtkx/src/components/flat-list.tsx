import { forwardRef, type ComponentType, type ReactElement } from "react"
import type { StyleProp } from "../contracts"
import type { ScrollViewProps } from "./scroll-view"
import {
  VirtualizedList,
  type ItemLayout,
  type ListRenderItemInfo,
  type ViewabilityConfig,
  type ViewToken,
  type VirtualizedListHandle,
  type VirtualizedListProps,
} from "./virtualized-list"

export type {
  ListRenderItemInfo,
  ViewabilityConfig,
  ViewToken,
} from "./virtualized-list"
// The FlatList ref exposes the full scroll surface of the windowed core
// (scrollTo, scrollToEnd, scrollToIndex, scrollToItem, scrollToOffset).
export type { VirtualizedListHandle as FlatListHandle } from "./virtualized-list"

export type FlatListProps<T> = Omit<ScrollViewProps, "children"> & {
  data: readonly T[]
  renderItem: (info: ListRenderItemInfo<T>) => ReactElement | null
  keyExtractor?: (item: T, index: number) => string
  // RN's per-cell wrapper — see virtualized-list.tsx for what the list hands
  // it and what it must apply.
  CellRendererComponent?: VirtualizedListProps<T>["CellRendererComponent"]
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
  estimatedItemSize?: number
  getItemLayout?: (data: readonly T[], index: number) => ItemLayout
  windowSize?: number
  initialNumToRender?: number
  maxToRenderPerBatch?: number
  updateCellsBatchingPeriod?: number
  extraData?: unknown
  inverted?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  style?: StyleProp
}

// FlatList is a thin veneer over the windowed VirtualizedList core: only the
// rows around the viewport are mounted (see virtualized-list.tsx).
const FlatListInner = forwardRef(
  <T,>(props: FlatListProps<T>, ref: React.Ref<VirtualizedListHandle>) => (
    <VirtualizedList
      {...props}
      ref={ref}
    />
  ),
)
FlatListInner.displayName = "FlatList"

export const FlatList = FlatListInner as <T>(
  props: FlatListProps<T> & { ref?: React.Ref<VirtualizedListHandle> },
) => ReactElement

export type SectionListData<T> = { title: string; data: readonly T[] }

// Viewability props are excluded: SectionList flattens sections into private
// row records, so ViewTokens would leak that internal row type instead of T —
// section-aware tokens are not implemented yet. `CellRendererComponent` is
// excluded for exactly the same reason: its `item` would be one of those
// records, not a T.
export type SectionListProps<T> = Omit<
  FlatListProps<T>,
  | "CellRendererComponent"
  | "data"
  | "renderItem"
  | "getItemLayout"
  | "onViewableItemsChanged"
  | "viewabilityConfig"
> & {
  sections: readonly SectionListData<T>[]
  renderItem: (info: ListRenderItemInfo<T>) => ReactElement | null
  renderSectionHeader?: (info: {
    section: SectionListData<T>
  }) => ReactElement | null
  // RN default on iOS; ours defaults to true too — section headers pin to
  // the top and get pushed out by the next section's header.
  stickySectionHeadersEnabled?: boolean
  // React 19 ref-as-prop: the same scroll surface FlatList exposes.
  ref?: React.Ref<VirtualizedListHandle>
}

type SectionRow<T> =
  | { kind: "header"; section: SectionListData<T> }
  | { kind: "item"; item: T; index: number }

export const SectionList = <T,>({
  sections,
  renderItem,
  renderSectionHeader,
  stickySectionHeadersEnabled = true,
  ref,
  ...rest
}: SectionListProps<T>): ReactElement => {
  const rows: SectionRow<T>[] = []
  const headerIndices: number[] = []
  for (const section of sections) {
    headerIndices.push(rows.length)
    rows.push({ kind: "header", section })
    section.data.forEach((item, index) => {
      rows.push({ kind: "item", item, index })
    })
  }
  return (
    <FlatList
      {...rest}
      ref={ref}
      data={rows}
      stickyHeaderIndices={
        stickySectionHeadersEnabled ? headerIndices : undefined
      }
      keyExtractor={(_row, index) => String(index)}
      renderItem={({ item: row }) =>
        row.kind === "header"
          ? (renderSectionHeader?.({ section: row.section }) ?? null)
          : renderItem({ item: row.item, index: row.index })
      }
    />
  )
}
