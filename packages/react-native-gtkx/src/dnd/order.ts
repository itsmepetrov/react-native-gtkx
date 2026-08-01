// The order arithmetic, kept free of every GTK import.
//
// Upstream's equivalents live in `components/sortableUtils` and are worklets;
// here they are plain functions, and they are in their own module so the unit
// test project — which has no GTK runtime — can import them. `sortable.tsx`
// re-exports them, so an app still imports them from the subpath root exactly
// as it does upstream.
import type { SortableData } from "./types"

/** `["a", "b"]` → `{ a: 0, b: 1 }`. Upstream's takes objects with an `id`;
 *  both shapes are accepted so no call site has to convert. */
export const listToObject = (
  items: readonly (string | SortableData)[],
): Record<string, number> => {
  const result: Record<string, number> = {}
  items.forEach((item, index) => {
    result[typeof item === "string" ? item : item.id] = index
  })
  return result
}

/** Moves the entry at `from` to `to`, returning a new position map. */
export const objectMove = (
  positions: Record<string, number>,
  from: number,
  to: number,
): Record<string, number> => {
  const ids = Object.keys(positions).sort(
    (a, b) => (positions[a] ?? 0) - (positions[b] ?? 0),
  )
  const [moved] = ids.splice(from, 1)
  if (moved !== undefined) {
    ids.splice(to, 0, moved)
  }
  return listToObject(ids)
}

export const clamp = (value: number, lower: number, upper: number): number =>
  Math.min(Math.max(value, lower), upper)
