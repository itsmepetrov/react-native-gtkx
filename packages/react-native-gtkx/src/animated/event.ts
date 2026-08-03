// Animated.event: the arg-mapping traversal RN's AnimatedEvent runs on every
// callback invocation, transcribed from
// node_modules/react-native/Libraries/Animated/AnimatedEvent.js —
// `__getHandler`'s NON-native branch, which is the only branch this platform
// ever needs. Upstream's native branch exists to hand a view tag, an event
// name and a serialized path to a native module that patches the animated
// value from the native thread, bypassing JS entirely; there is no such
// native side here (see native-driver.ts), so `Animated.event` always
// returns the plain JS callback (upstream's `eventImpl` does the same thing
// whenever `!animatedEvent.__isNative` — this platform's `__isNative` is
// simply always false).
//
// argMapping is POSITIONAL over the callback's own arguments — not always
// "the event": a `ScrollView.onScroll` handler takes one argument, so
// `[{ nativeEvent: { contentOffset: { y: scrollY } } }]` maps it; a
// `PanResponder.onPanResponderMove` handler takes two,
// `(event, gestureState)`, and a drag reads the SECOND one —
// `[null, { dx: pan.x, dy: pan.y }]` — leaving the first argument's slot
// `null` (RN supports mapping either argument; this is the one PanResponder
// actually uses in every example in the wild). A `null` entry, and anything
// past the end of `argMapping`, is simply never traversed.
//
// A leaf that is an Animated.Value gets `setValue()`'d with the number found
// at the same path in the real argument; an Animated.ValueXY recurses into
// its own `x`/`y`. A missing path — the real argument genuinely has nothing
// at that key — resolves to `undefined` and is silently skipped, AT ANY
// DEPTH. That widening is deliberate and is the one place this
// reimplementation departs from the source it is transcribed from: upstream
// indexes the missing object directly (`recEvt[mappingKey]`), which throws
// one level up from a leaf rather than at it — a mapping that reaches for
// `contentSize.height` against an event shape that happens not to carry a
// `contentSize` crashes upstream and does not here.
import { warnNativeDriverIgnored } from "./native-driver"
import { AnimatedValue } from "./value"
import { AnimatedValueXY } from "./value-xy"

// RN's `Mapping` type (AnimatedEvent.js), transcribed: a leaf is an
// Animated.Value/ValueXY, anything else recurses one key at a time.
export type EventMapping =
  | { [key: string]: EventMapping | null | undefined }
  | AnimatedValue
  | AnimatedValueXY

export type AnimatedEventConfig = {
  // Called with the SAME arguments the returned handler itself received —
  // RN's `_callListeners(...args)` — so a listener attached to
  // `ScrollView.onScroll` gets the one `ScrollEvent`, and one attached to
  // `onPanResponderMove` gets `(event, gestureState)` both, after the
  // mapping has already written this call's values.
  //
  // `never[]` rather than `unknown[]`: this field is filled in by a caller
  // whose listener has a concrete signature (`(event: ScrollEvent) => void`,
  // or the two-argument PanResponder shape), and a parameter position is
  // CONTRAVARIANT — a listener typed for `unknown` arguments would reject
  // every concretely-typed listener there is. `never` is the parameter type
  // every function's parameters are wider than, which is what makes a
  // listener of any real event shape assignable here; the handler below
  // casts back on the one call site that actually invokes it.
  listener?: (...args: never[]) => void
  // Accepted for RN source compatibility and ignored, with the platform's
  // usual one-line warning (native-driver.ts) — the GTK backend has no
  // native side to attach the event to, so unlike upstream this never
  // changes what `Animated.event` RETURNS: it is always the plain JS
  // handler below, `useNativeDriver` true or false.
  useNativeDriver?: boolean
}

const traverse = (
  mapping: EventMapping | null | undefined,
  value: unknown,
): void => {
  if (mapping instanceof AnimatedValue) {
    if (typeof value === "number") {
      mapping.setValue(value)
    }
    return
  }
  if (mapping instanceof AnimatedValueXY) {
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>
      traverse(mapping.x, record.x)
      traverse(mapping.y, record.y)
    }
    return
  }
  if (mapping !== null && typeof mapping === "object") {
    // A missing path in the real argument resolves every key under it to
    // `undefined` rather than throwing — see the file header.
    const record = value as Record<string, unknown> | null | undefined
    for (const key of Object.keys(mapping)) {
      traverse(mapping[key], record?.[key])
    }
  }
}

/**
 * `Animated.event(argMapping, config?)`. Returns a plain callback — assign
 * it directly to `ScrollView.onScroll`, to `onPanResponderMove`, or to any
 * other RN event prop whose argument shape `argMapping` mirrors.
 */
export const createAnimatedEvent = (
  argMapping: readonly (EventMapping | null | undefined)[],
  config: AnimatedEventConfig = {},
): ((...args: unknown[]) => void) => {
  if (config.useNativeDriver) {
    warnNativeDriverIgnored()
  }
  const { listener } = config

  return (...args: unknown[]): void => {
    argMapping.forEach((mapping, index) => {
      traverse(mapping, args[index])
    })
    // `never[]` is unconstructible from real values on purpose (see the
    // config type above) — this is the one place that trades back for the
    // ability to actually call the listener with what was received.
    listener?.(...(args as never[]))
  }
}
