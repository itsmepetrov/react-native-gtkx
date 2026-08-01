// The wire format and the two order utilities — the pure-logic half of
// react-native-gtkx/dnd, which the GTK tests exercise only end to end.
//
// The payload matters more than its size suggests: it is the only thing that
// crosses GDK during a drag, so a change here silently breaks every drop
// (and, worse, would let a string dragged in from a text editor look like a
// draggable).
import { expect, test } from "vitest"
import { listToObject, objectMove } from "../../src/dnd/order"
import {
  decodePayload,
  encodePayload,
  FREE_SCOPE,
  nextDraggableId,
} from "../../src/dnd/payload"

test("a payload round-trips through its string form", () => {
  const payload = { scope: FREE_SCOPE, id: "task-7" }
  expect(decodePayload(encodePayload(payload))).toEqual(payload)
})

test("an id containing slashes survives, because only the first two are structural", () => {
  const payload = { scope: "sortable-3", id: "a/b/c" }
  expect(decodePayload(encodePayload(payload))).toEqual(payload)
})

test("a string this module did not write decodes to nothing", () => {
  // The reason the prefix exists: dropping selected text from an editor onto
  // a Droppable must be refused, not mistaken for a draggable.
  expect(decodePayload("some text a user dragged")).toBeNull()
  expect(decodePayload("rngtkx-dnd")).toBeNull()
  expect(decodePayload("rngtkx-dnd/free")).toBeNull()
  expect(decodePayload(null)).toBeNull()
})

test("generated ids never collide", () => {
  const ids = new Set([nextDraggableId(), nextDraggableId(), nextDraggableId()])
  expect(ids.size).toBe(3)
})

test("listToObject takes ids or objects with an id", () => {
  expect(listToObject(["a", "b", "c"])).toEqual({ a: 0, b: 1, c: 2 })
  expect(listToObject([{ id: "a" }, { id: "b" }])).toEqual({ a: 0, b: 1 })
})

test("objectMove moves one entry and renumbers the rest", () => {
  const positions = { a: 0, b: 1, c: 2 }
  expect(objectMove(positions, 0, 2)).toEqual({ b: 0, c: 1, a: 2 })
  expect(objectMove(positions, 2, 0)).toEqual({ c: 0, a: 1, b: 2 })
  // A move onto the position it already holds is the identity, which is what
  // makes a drop on the dragged row itself a no-op rather than a reshuffle.
  expect(objectMove(positions, 1, 1)).toEqual(positions)
})
