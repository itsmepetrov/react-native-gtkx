import { forwardRef, type ComponentType, type ReactElement } from "react"
import type { StyleProp } from "../contracts"
import type { ScrollViewProps } from "./scroll-view"
import {
  VirtualizedList,
  type ItemLayout,
  type ListRenderItemInfo,
  type VirtualizedListHandle,
} from "./virtualized-list"

export type { ListRenderItemInfo } from "./virtualized-list"
// The FlatList ref exposes the full scroll surface of the windowed core
// (scrollTo, scrollToEnd, scrollToIndex, scrollToItem, scrollToOffset).
export type { VirtualizedListHandle as FlatListHandle } from "./virtualized-list"

export type FlatListProps<T> = Omit<ScrollViewProps, "children"> & {
  data: readonly T[]
  renderItem: (info: ListRenderItemInfo<T>) => ReactElement | null
  keyExtractor?: (item: T, index: number) => string
  ItemSeparatorComponent?: ComponentType | null
  ListHeaderComponent?: ComponentType | ReactElement | null
  ListFooterComponent?: ComponentType | ReactElement | null
  ListEmptyComponent?: ComponentType | ReactElement | null
  onEndReached?: () => void
  onEndReachedThreshold?: number
  estimatedItemSize?: number
  getItemLayout?: (data: readonly T[], index: number) => ItemLayout
  windowSize?: number
  initialNumToRender?: number
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

export type SectionListProps<T> = Omit<
  FlatListProps<T>,
  "data" | "renderItem" | "getItemLayout"
> & {
  sections: readonly SectionListData<T>[]
  renderItem: (info: ListRenderItemInfo<T>) => ReactElement | null
  renderSectionHeader?: (info: {
    section: SectionListData<T>
  }) => ReactElement | null
}

type SectionRow<T> =
  | { kind: "header"; section: SectionListData<T> }
  | { kind: "item"; item: T; index: number }

export const SectionList = <T,>({
  sections,
  renderItem,
  renderSectionHeader,
  ...rest
}: SectionListProps<T>): ReactElement => {
  const rows: SectionRow<T>[] = []
  for (const section of sections) {
    rows.push({ kind: "header", section })
    section.data.forEach((item, index) => {
      rows.push({ kind: "item", item, index })
    })
  }
  return (
    <FlatList
      {...rest}
      data={rows}
      keyExtractor={(_row, index) => String(index)}
      renderItem={({ item: row }) =>
        row.kind === "header"
          ? (renderSectionHeader?.({ section: row.section }) ?? null)
          : renderItem({ item: row.item, index: row.index })
      }
    />
  )
}
