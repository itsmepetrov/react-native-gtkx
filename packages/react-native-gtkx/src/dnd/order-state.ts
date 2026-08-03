// The order-owning state shared by every list shape in this module: the
// plain vertical `Sortable`, the horizontal direction of the same component,
// and `SortableGrid`. All three keep the SAME representation — an ARRAY of
// ids, index 0..N-1 — because that is what upstream's own `listToObject` /
// `listToGridObject` build from a list on mount, and reducing every reorder
// back to "produce a new array in this order" is what lets one hook serve
// a row, a column and a grid cell alike (a grid's `GridPositions` is just
// this array run through `calculateGridPosition`; see grid-order.ts).
import { useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { nextDraggableId } from "./payload"
import type { SortableData } from "./types"

export const keyOf = <TData extends SortableData>(
  item: TData,
  index: number,
  extractor?: (item: TData, index: number) => string,
): string => extractor?.(item, index) ?? item.id

export type OrderState<TData> = {
  /** Namespaces this list's payloads, so dragging a row does not light up
   *  every `Droppable` on the screen. */
  scope: string
  order: string[]
  setOrder: Dispatch<SetStateAction<string[]>>
  items: TData[]
}

/** The order state, shared by every `use*SortableList` hook and every list
 *  component (`Sortable`, `SortableGrid`) in this module. */
export const useOrder = <TData extends SortableData>(
  data: TData[],
  itemKeyExtractor?: (item: TData, index: number) => string,
): OrderState<TData> => {
  // Lazy initial state, not a ref: stable for the list's lifetime, and a ref
  // may not be read during render.
  const [scope] = useState(() => `sortable-${nextDraggableId()}`)

  const incoming = useMemo(
    () => data.map((item, index) => keyOf(item, index, itemKeyExtractor)),
    [data, itemKeyExtractor],
  )
  const [order, setOrder] = useState<string[]>(incoming)

  // The list owns the ORDER; the app owns the SET. Adding or removing an item
  // has to reach the order without discarding a reorder the user already
  // made — so new ids go to the end, departed ids drop out, and a pure
  // reorder of `data` by the app is ignored (upstream's contract too: the
  // component owns the order).
  //
  // Adjusted DURING RENDER rather than in an effect. React documents this as
  // the way to derive state from changed props, and it matters here: an
  // effect would paint one frame in the stale order every time the app
  // appends an item.
  const signature = incoming.join(" ")
  const [seenSignature, setSeenSignature] = useState(signature)
  if (seenSignature !== signature) {
    setSeenSignature(signature)
    const known = new Set(incoming)
    const next = [
      ...order.filter((id) => known.has(id)),
      ...incoming.filter((id) => !order.includes(id)),
    ]
    if (
      next.length !== order.length ||
      next.some((id, index) => id !== order[index])
    ) {
      setOrder(next)
    }
  }

  const items = useMemo(() => {
    const byId = new Map<string, TData>()
    data.forEach((item, index) => {
      byId.set(keyOf(item, index, itemKeyExtractor), item)
    })
    return order
      .map((id) => byId.get(id))
      .filter((item): item is TData => item !== undefined)
  }, [order, data, itemKeyExtractor])

  return { scope, order, setOrder, items }
}
