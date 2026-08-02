// The pure half of the `react-native-worklets` mirror: the whole surface, and
// the factory behind the thread functions.
//
// Split from index.ts because index.ts is the module both presets alias the
// PACKAGE NAME onto, and a unit test wants the surface without the name. Every
// export here is reachable from a machine with no GTK on it.
//
// THE RULE THIS FILE FOLLOWS, and it is the whole design: mirror upstream's
// own NON-NATIVE implementation — the `.ts` files next to its `.native.ts`
// ones, which are what react-native-windows and the web run. Where that file
// computes something, this one computes the same thing; where it throws, this
// one refuses by name. That is not a shortcut, it is the only boundary with a
// source of truth: a worklet runtime is structural, and upstream agrees.
// Measured against react-native-worklets 0.11.3.
//
// The one place that rule is deliberately NOT followed is HOW LATE a UI hop
// lands: upstream's non-native build waits for a `requestAnimationFrame` and
// this one does not. See reanimated-compat/threads.ts — the web's rAF stands
// in for a UI runtime it has not got, React Native's real one does not wait
// for a frame, and waiting here broke a measurement round trip.
import { createThreads } from "../reanimated-compat/threads"
import { createUnsupportedFactory } from "../unsupported-export"

/** A function the Babel plugin processed. Never produced on this platform. */
export type WorkletFunction<
  Args extends unknown[] = unknown[],
  ReturnValue = unknown,
> = ((...args: Args) => ReturnValue) & { __workletHash?: number }

/** Upstream's handle for a runtime that cannot exist here — see the refusals. */
export type WorkletRuntime = { __workletRuntime: true }

/** Upstream's serializer handle. Identity here: nothing leaves this runtime. */
export type SerializableRef<T = unknown> = T

/** @deprecated Upstream's former name for {@link SerializableRef}. */
export type ShareableRef<T = unknown> = SerializableRef<T>

/**
 * The thread surface. `runOnUI`/`runOnJS`/`scheduleOnUI`/`scheduleOnRN` come
 * from the same `createThreads` the Reanimated surface uses — index.ts hands
 * both modules the SAME instance, so a job queued through either name lands
 * in the same batch, as it does upstream where one package re-exports the
 * other.
 */
export const createWorkletsSurface = () => {
  const threads = createThreads()

  /**
   * Upstream's `runOnUIAsync` resolves with the worklet's return value when
   * the UI hop runs it — the one thread API that hands anything back, because
   * a promise crosses the deferral the others impose.
   */
  const runOnUIAsync = <A extends unknown[], R>(
    worklet: (...args: A) => R,
    ...args: A
  ): Promise<R> =>
    new Promise<R>((resolve) => {
      threads.scheduleOnUI(() => {
        resolve(worklet(...args))
      })
    })

  return { ...threads, runOnUIAsync }
}

// --- the pure surface ----------------------------------------------------

export { isWorkletFunction } from "../reanimated-compat/threads"

/**
 * Upstream's runtime taxonomy. There is one runtime here and it is the React
 * Native one — GTK's main loop IS the JS thread — which is exactly what
 * upstream's non-native path reports too: its initializer sets
 * `__RUNTIME_KIND` to `ReactNative` and never changes it.
 */
export enum RuntimeKind {
  ReactNative = 1,
  UI = 2,
  Worker = 3,
}

export const getRuntimeKind = (): RuntimeKind => RuntimeKind.ReactNative
export const isRNRuntime = (): boolean => true
export const isUIRuntime = (): boolean => false
export const isWorkerRuntime = (): boolean => false
export const isWorkletRuntime = (): boolean => false

/** Mirrored as data, as upstream's non-native `runtimes.ts` does. */
export const UIRuntimeId: number = RuntimeKind.UI

/**
 * The serializer, which on a single-runtime path is a file of identity
 * functions — a value never leaves the runtime it was made in, so there is
 * nothing to clone and nothing to register.
 */
// The ones that ignore their argument are typed as a signature and
// implemented without parameters: the CALL shape is what matters to a
// consumer, and a named-but-unused parameter is only there to be linted.
export const createSerializable = <T>(value: T): SerializableRef<T> => value
export const isSerializableRef: (value: unknown) => boolean = () => true
export const registerCustomSerializable: (
  registration: unknown,
) => void = () => {}
export const makeShareable = <T>(value: T): T => value
export const makeShareableCloneRecursive = <T>(value: T): SerializableRef<T> =>
  value
export const makeShareableCloneOnUIRecursive = <T>(
  value: T,
): SerializableRef<T> => value
/** @deprecated Upstream's former name for {@link isSerializableRef}. */
export const isShareableRef = isSerializableRef

/** The mapping cache upstream keeps for the serializer, which has nothing to map. */
export const serializableMappingCache: {
  set(serializable: object, ref?: unknown): void
  get(key: object): unknown
} = {
  set: () => {},
  get: () => null,
}
/** @deprecated Upstream's former name for {@link serializableMappingCache}. */
export const shareableMappingCache = serializableMappingCache

/** Deprecated and a documented no-op upstream, kept callable for source parity. */
export const callMicrotasks = (): void => {}

/** Structural checks, portable exactly as upstream writes them. */
export const isShareable = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !!(value as Record<string, unknown>).__shareableRef

export const isSynchronizable = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !!(value as Record<string, unknown>).__synchronizableRef

/**
 * Bundle mode is a Babel/Metro transform of upstream's own plugin, which this
 * platform never runs — so the honest answer is upstream's non-native one.
 */
export const isBundleModeEnabled = (): boolean => false

/** A debug toggle for the UI runtime's clock, which is this platform's only clock. */
export const toggleSlowAnimationsOnUIRuntime = (): boolean => false

/**
 * Feature flags gate upstream's own native experiments. None of them exist
 * here, so every flag reads false and setting one changes nothing — again
 * upstream's non-native answer rather than an invention.
 */
export const getStaticFeatureFlag: (name: string) => boolean = () => false
export const getDynamicFeatureFlag: (name: string) => boolean = () => false
export const setDynamicFeatureFlag: (
  name: string,
  value: boolean,
) => void = () => {}

// --- the refusals --------------------------------------------------------
//
// Exactly the exports whose non-native implementation upstream ships as a
// `throw`. Enumerated by hand rather than produced by a Proxy over the module,
// because ESM named imports resolve statically: a symbol missing from the
// module fails at BUILD time with "no export named X", and only the names
// here can produce the descriptive runtime message.

const unsupported = createUnsupportedFactory(
  "react-native-worklets",
  "Implemented here: runOnUI/scheduleOnUI/runOnJS/scheduleOnRN/runOnUIAsync, isWorkletFunction, " +
    "the serializer (identity — nothing leaves this runtime) and the runtime-kind checks. " +
    "What is not is a SECOND runtime: this platform has one thread, GTK's main loop, " +
    "and upstream's own non-native build throws for these too. See docs/api.md.",
)

/* eslint-disable @typescript-eslint/no-explicit-any */

// --- a second runtime, which is structural by definition ---
export const createWorkletRuntime: any = unsupported("createWorkletRuntime")
export const runOnRuntime: any = unsupported("runOnRuntime")
export const runOnRuntimeAsync: any = unsupported("runOnRuntimeAsync")
export const runOnRuntimeAsyncWithId: any = unsupported(
  "runOnRuntimeAsyncWithId",
)
export const runOnRuntimeSync: any = unsupported("runOnRuntimeSync")
export const runOnRuntimeSyncWithId: any = unsupported("runOnRuntimeSyncWithId")
export const scheduleOnRuntime: any = unsupported("scheduleOnRuntime")
export const scheduleOnRuntimeWithId: any = unsupported(
  "scheduleOnRuntimeWithId",
)
export const getUIRuntimeHolder: any = unsupported("getUIRuntimeHolder")
export const getUISchedulerHolder: any = unsupported("getUISchedulerHolder")

// --- synchronous hops across a boundary that is not there ---
// Both are the "run it over there and give me the answer now" pair, and both
// throw upstream on every single-runtime build. Deferring instead would be
// worse than refusing: the caller wants the RETURN VALUE, and a deferred call
// has none.
export const runOnUISync: any = unsupported("runOnUISync")
export const executeOnUIRuntimeSync: any = unsupported("executeOnUIRuntimeSync")

// --- memory shared between runtimes ---
export const createShareable: any = unsupported("createShareable")
export const createSynchronizable: any = unsupported("createSynchronizable")

/**
 * The TurboModule behind the whole package. Upstream's non-native build
 * exports it as `null`, which fails as "cannot read properties of null" and
 * names nothing; this refuses by name instead. The one deliberate deviation
 * from the mirror rule above, and it can only ever turn a worse error into a
 * better one — nothing that works against `null` works against a refusal.
 */
export const WorkletsModule: any = unsupported("WorkletsModule")
