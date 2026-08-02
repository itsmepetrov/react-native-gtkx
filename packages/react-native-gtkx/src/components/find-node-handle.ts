// RN's escape hatch from a ref to a native view handle.
//
// On a bridge platform the returned integer is the native view tag, and it
// exists because a JS ref cannot cross to native — the number can. There is
// no boundary here: a widget call is a synchronous C call on this same
// stack, and `widgetForHandle` already resolves a component handle straight
// to its `Gtk.Widget`. So the honest question is not "what is a native
// handle here" but "what do the callers do with the number", and measured
// against the libraries that ask for one, they do exactly two things:
//
//   - compare it. `@gorhom/bottom-sheet` reads it in `useScrollableSetter`
//     and `useScrollable` to decide whether the scrollable that just mounted
//     is the one it already tracks (`id !== ref.id`). It never dereferences
//     it — the ref itself travels alongside, in the same record.
//   - hand it back to `measureLayout`. `react-native-draggable-flatlist`
//     takes a handle for its outer scroll container in
//     `NestableDraggableFlatList` and passes it as the first argument of
//     `containerRef.current.measureLayout(...)`, which is RN's other
//     spelling of "relative to that view".
//
// Both are satisfied by an integer that is stable per mounted WIDGET and
// resolvable back to it, which is what `nodeHandleFor` mints and what
// `measureLayout` now accepts. Returning the handle OBJECT instead would
// satisfy them too and would be a lie about the type: `NodeHandle` is a
// number on every platform RN runs on, and a library that stores one in a
// `Map<number, …>` or logs it would get something else. Keying by the widget
// rather than by the handle is what makes the tag survive a re-render — a
// `useImperativeHandle` builds a fresh handle object each time, and a tag
// that changed with it would tell `@gorhom/bottom-sheet` its scrollable had
// been replaced on every render.
//
// What it does NOT do is reach anything native. There is no `UIManager` here
// to pass a tag to, so a tag is worth exactly what this platform can resolve
// it to and no more — see docs/api.md.
import { nodeHandleFor, type NodeHandle } from "./measure"

/**
 * RN's `findNodeHandle`: the node handle for a mounted component, or null.
 *
 * Accepts what RN accepts — a component handle (what a ref holds here), a
 * node handle (returned unchanged), or null/undefined. Anything else,
 * including a ref to something this platform never registered as a host
 * view, returns null rather than inventing a tag for it.
 */
export const findNodeHandle = (
  componentOrHandle: unknown,
): NodeHandle | null => {
  if (componentOrHandle === null || componentOrHandle === undefined) {
    return null
  }
  if (typeof componentOrHandle === "number") {
    return componentOrHandle
  }
  return nodeHandleFor(componentOrHandle)
}

export type { NodeHandle }
