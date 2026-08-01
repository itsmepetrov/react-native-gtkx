// react-native-gtkx/dnd — `react-native-reanimated-dnd`'s API, on GTK's own
// drag-and-drop.
//
// WHY this is a subpath of its own rather than part of `common` or `gtk`.
// `common` is Adwaita's LOOK written in portable React Native; this is
// behaviour, and GTK behaviour at that. `gtk` exists on the premise that the
// import is the signal an app is crossing into Linux-only code — and this
// module's premise is the exact opposite: the app's import should not change
// at all, so the specifier has to be ALIASABLE. `react-native-gtkx/svg` is
// the precedent, and the Metro and Vite presets rewrite
// `react-native-reanimated-dnd` onto this the same way they rewrite
// `react-native-svg`.
//
// The library itself cannot run here: Reanimated 4, worklets and RNGH at
// module scope in twelve of its files, with the sort algorithm inside
// `useAnimatedReaction` and the row layout inside `useAnimatedStyle`. The
// evidence, and the prop-by-prop account of what this mirror honours and
// what it deliberately does not, is in docs/research/drag-and-drop.md.

export { DropProvider, useDropContext } from "./context"

export {
  Draggable,
  DraggableHandle,
  useDraggable,
  // What `useDraggable` actually returns. `UseDraggableReturn` below is the
  // mirrored half (upstream's field names); this adds the two fields a
  // caller rendering its own view cannot do without — the measurable ref and
  // the drag source itself. Unexported, the hook's own documented use case
  // ("for a component that owns its own view") could not be typed by the
  // component that owns it; porting upstream's `CustomDraggable` is what
  // found that.
  type UseDraggableResult,
} from "./draggable"

export { Droppable, useDroppable } from "./droppable"

export { clamp, listToObject, objectMove } from "./order"

export {
  Sortable,
  SortableItem,
  useSortable,
  useSortableList,
} from "./sortable"

export {
  DraggableState,
  HorizontalScrollDirection,
  ScrollDirection,
  SortableDirection,
  type AnimationFunction,
  type CollisionAlgorithm,
  type DraggableHandleProps,
  type DraggableProps,
  type DropAlignment,
  type DroppableProps,
  type DroppedItemsMap,
  type DropOffset,
  type DropProviderProps,
  type DropProviderRef,
  type SharedValueLike,
  type SortableData,
  type SortableHandleProps,
  type SortableItemProps,
  type SortableProps,
  type SortableRenderItemProps,
  type UseDraggableOptions,
  type UseDraggableReturn,
  type UseDroppableOptions,
  type UseDroppableReturn,
  type UseSortableListOptions,
  type UseSortableListReturn,
  type UseSortableOptions,
  type UseSortableReturn,
} from "./types"

// Upstream exports these from `components/sortableUtils`; they are worklet
// helpers there, plain functions here. `setPosition` and `setAutoScroll`
// mutate a SharedValue during a UI-thread gesture — there is no gesture on
// the UI thread here, so they would have nothing to drive and are NOT
// re-exported. An app that imported them was reaching into upstream's
// internals; the build failing at that import is the correct outcome.
