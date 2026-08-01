// What actually crosses GDK during a drag.
//
// A GdkContentProvider carries a GValue of a negotiated type, not arbitrary
// JavaScript — so a `Draggable`'s `data` (an object, a closure, anything)
// cannot travel on the wire. What travels is a STRING that names the drag:
// the scope it belongs to and the draggable's id. The `data` itself stays in
// the provider's own registry on the JS side and is looked up on drop.
//
// The consequence worth knowing: a drop that arrives from ANOTHER process
// carries a string this module did not write, so it resolves to no data and
// is refused. Cross-application drops are a real capability of the layer
// underneath (see docs/research/drag-and-drop.md) but they are not what the
// mirrored API describes, so they are not silently mapped onto it.

/** Prefix, so a string dragged in from a text editor is never mistaken for
 *  one of ours. */
const MARK = "rngtkx-dnd"

/** Draggables and droppables that are not part of a `Sortable`. */
export const FREE_SCOPE = "free"

export type DragPayload = { scope: string; id: string }

/** `rngtkx-dnd/<scope>/<id>` — the id may itself contain slashes, so only
 *  the first two separators are structural. */
export const encodePayload = ({ scope, id }: DragPayload): string =>
  `${MARK}/${scope}/${id}`

export const decodePayload = (raw: string | null): DragPayload | null => {
  if (!raw) {
    return null
  }
  const first = raw.indexOf("/")
  if (first === -1 || raw.slice(0, first) !== MARK) {
    return null
  }
  const second = raw.indexOf("/", first + 1)
  if (second === -1) {
    return null
  }
  return { scope: raw.slice(first + 1, second), id: raw.slice(second + 1) }
}

let counter = 0

/** Upstream generates `draggable-<random>` when no `draggableId` is given.
 *  A counter rather than `Math.random()` so two ids can never collide and a
 *  test can read them. */
export const nextDraggableId = (): string => `draggable-${++counter}`
