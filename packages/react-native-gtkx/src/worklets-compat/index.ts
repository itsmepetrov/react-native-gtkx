// react-native-gtkx/worklets — the `react-native-worklets` name, on a
// platform with one thread.
//
// Reanimated 4 moved the worklet surface into its own package, and libraries
// import it under that name rather than through Reanimated. That is not a
// detail: `react-native-reanimated-dnd` 2.0.0 pulls `scheduleOnRN` and
// `scheduleOnUI` out of it at module scope in five of its hooks
// (useDraggable, useDroppable, useSortable, useHorizontalSortable,
// useGridSortable) with no `try { require } catch` anywhere, so an unaliased
// package name fails at IMPORT rather than at use. Aliasing
// `react-native-reanimated` alone left that wall standing one package over.
//
// The surface itself already existed — this module adds the NAME. Both
// presets alias the package onto it (src/vite/index.ts, src/metro/index.ts),
// and the thread functions are the very same instance the Reanimated surface
// exports, so `scheduleOnUI` reached through either package name queues into
// one batch. Upstream has the same property for the same reason: Reanimated
// re-exports them from here.
//
// What is implemented and what refuses is decided by upstream's own
// non-native build rather than by us — see surface.ts, which is also where
// everything that needs no clock lives so unit tests can reach it without
// GTK. docs/api.md records the boundary.
import { glibScheduler } from "../components/frame-scheduler"
import { createWorkletsSurface } from "./surface"

const { runOnUI, scheduleOnUI, runOnJS, scheduleOnRN, runOnUIAsync } =
  createWorkletsSurface(glibScheduler)

export { runOnJS, runOnUI, runOnUIAsync, scheduleOnRN, scheduleOnUI }

export {
  callMicrotasks,
  createSerializable,
  createShareable,
  createSynchronizable,
  createWorkletRuntime,
  executeOnUIRuntimeSync,
  getDynamicFeatureFlag,
  getRuntimeKind,
  getStaticFeatureFlag,
  getUIRuntimeHolder,
  getUISchedulerHolder,
  isBundleModeEnabled,
  isRNRuntime,
  isSerializableRef,
  isShareable,
  isShareableRef,
  isSynchronizable,
  isUIRuntime,
  isWorkerRuntime,
  isWorkletFunction,
  isWorkletRuntime,
  makeShareable,
  makeShareableCloneOnUIRecursive,
  makeShareableCloneRecursive,
  registerCustomSerializable,
  runOnRuntime,
  runOnRuntimeAsync,
  runOnRuntimeAsyncWithId,
  runOnRuntimeSync,
  runOnRuntimeSyncWithId,
  RuntimeKind,
  runOnUISync,
  scheduleOnRuntime,
  scheduleOnRuntimeWithId,
  serializableMappingCache,
  setDynamicFeatureFlag,
  shareableMappingCache,
  toggleSlowAnimationsOnUIRuntime,
  UIRuntimeId,
  WorkletsModule,
} from "./surface"

export type {
  SerializableRef,
  ShareableRef,
  WorkletFunction,
  WorkletRuntime,
} from "./surface"
