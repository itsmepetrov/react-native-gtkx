import {
  forwardRef,
  Fragment,
  useRef,
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

export type ListRenderItemInfo<T> = { item: T; index: number }

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

// v1 renders every row (like RN's ScrollView-backed lists before
// virtualization). GtkListView-based recycling is PRD branch D.
const FlatListInner = forwardRef(
  <T,>(
    {
      data,
      renderItem,
      keyExtractor,
      ItemSeparatorComponent,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
      onEndReached,
      onEndReachedThreshold = 0.1,
      onScroll,
      ...scrollProps
    }: FlatListProps<T>,
    ref: React.Ref<ScrollViewHandle>,
  ) => {
    const endReachedForSize = useRef(-1)

    const handleScroll = (event: ScrollEvent): void => {
      onScroll?.(event)
      if (!onEndReached) {
        return
      }
      const { contentOffset, contentSize } = event.nativeEvent
      const extent = scrollProps.horizontal
        ? contentSize.width
        : contentSize.height
      const offset = scrollProps.horizontal ? contentOffset.x : contentOffset.y
      const threshold = extent * onEndReachedThreshold
      if (
        extent > 0 &&
        offset > 0 &&
        extent - offset < extent * 0.2 + threshold
      ) {
        if (endReachedForSize.current !== extent) {
          endReachedForSize.current = extent
          onEndReached()
        }
      }
    }

    return (
      <ScrollView
        {...scrollProps}
        ref={ref}
        onScroll={handleScroll}
      >
        {renderAux(ListHeaderComponent)}
        {data.length === 0 && renderAux(ListEmptyComponent)}
        {data.map((item, index) => {
          const key = keyExtractor ? keyExtractor(item, index) : String(index)
          return (
            <Fragment key={key}>
              {index > 0 && ItemSeparatorComponent ? (
                <ItemSeparatorComponent />
              ) : null}
              {renderItem({ item, index })}
            </Fragment>
          )
        })}
        {renderAux(ListFooterComponent)}
      </ScrollView>
    )
  },
)
FlatListInner.displayName = "FlatList"

export const FlatList = FlatListInner as <T>(
  props: FlatListProps<T> & { ref?: React.Ref<ScrollViewHandle> },
) => ReactElement

export type SectionListData<T> = { title: string; data: readonly T[] }

export type SectionListProps<T> = Omit<
  FlatListProps<T>,
  "data" | "renderItem"
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
