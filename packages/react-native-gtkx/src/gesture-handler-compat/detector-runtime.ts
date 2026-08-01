// Everything a mounted `GestureDetector` has to remember between renders, in
// a closure rather than in the component.
//
// This file exists because the mutable state genuinely belongs here, and the
// React Compiler's lint rules are right to say so: a component may not read
// or write a ref while rendering. The detector needs three things that
// outlive a render — the current config, the child's handle, and the child's
// own forwarded ref — and every one of them is only ever touched from a
// callback, an effect or a GTK event. Keeping them behind functions makes
// that structural instead of a promise.
import { widgetForHandle } from "../components/measure"
import { computePointInWindow } from "../gtkx/bridge/index"
import { requestResponder } from "../responder/use-responder"
import { longPressDecider } from "./long-press"
import { nativeDecider } from "./native"
import { panDecider } from "./pan"
import {
  createRecognizer,
  type Recognizer,
  type RecognizerDecider,
  type Rect,
} from "./recognizer"
import { tapDecider } from "./tap"
import type { GestureKind, RecognizerConfig } from "./types"

/**
 * The whole of what tells the four kinds apart: which pair of predicates the
 * one machine runs. There is no second state machine, no second event stream
 * and no second grant channel — `docs/research/gesture-detector.md` predicted
 * that `Tap` and `LongPress` would be an afternoon over slice 1's core, and
 * this map is the shape of that claim.
 *
 * `Native` stretched it by exactly one flag rather than one machine: it wants
 * the same progression without the responder grant, because taking the
 * interaction is the one thing a gesture that stands for the native widget
 * must not do. See ./native and `RecognizerDecider.claimsResponder`.
 */
const DECIDERS: Record<GestureKind, RecognizerDecider> = {
  pan: panDecider,
  tap: tapDecider,
  longPress: longPressDecider,
  native: nativeDecider,
}

/** A ref in either of React's two spellings. */
type AnyRef =
  ((instance: unknown) => void) | { current: unknown } | null | undefined

let warnedWithoutWidget = false

const warnNoWidget = (): void => {
  if (warnedWithoutWidget) {
    return
  }
  warnedWithoutWidget = true
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production"
  if (!isProduction) {
    console.warn(
      "react-native-gtkx: `GestureDetector`'s child exposed no ref carrying a widget, so the gesture " +
        "cannot measure its own view. `hitSlop`, `shouldCancelWhenOutside` and the `x`/`y` fields of " +
        "every event will be wrong or ignored. Give the child a `ref` built with the platform's own " +
        "measure handle, or wrap it in a `View`. See docs/api.md.",
    )
  }
}

export type DetectorRuntime = {
  recognizer: Recognizer
  /** The callback ref to put on the child. Stable for the detector's life. */
  assignHandle: (instance: unknown) => void
  /** Called from a layout effect on every render. */
  sync: (config: RecognizerConfig, forwarded: AnyRef) => void
  /** Warns once if the child turned out to carry no widget. */
  checkWidget: () => void
}

export const createDetectorRuntime = (
  handlerTag: number,
  kind: GestureKind,
  initialConfig: RecognizerConfig,
): DetectorRuntime => {
  let config = initialConfig
  let handle: unknown = null
  let forwardedRef: AnyRef = null

  const publish = (instance: unknown): void => {
    if (typeof forwardedRef === "function") {
      forwardedRef(instance)
    } else if (forwardedRef) {
      forwardedRef.current = instance
    }
  }

  const recognizer = createRecognizer(
    handlerTag,
    DECIDERS[kind],
    () => config,
    {
      boundsInWindow: (): Rect | null => {
        const widget = widgetForHandle(handle)
        if (!widget) {
          return null
        }
        const origin = computePointInWindow(widget, 0, 0)
        if (!origin) {
          return null
        }
        return {
          x: origin.x,
          y: origin.y,
          width: widget.getWidth(),
          height: widget.getHeight(),
        }
      },
      requestResponder: (): boolean => {
        const widget = widgetForHandle(handle)
        return widget !== null && requestResponder(widget)
      },
    },
  )

  return {
    recognizer,

    assignHandle: (instance: unknown) => {
      handle = instance
      publish(instance)
      // No return value: React 19 reads one as a callback-ref cleanup.
    },

    sync: (nextConfig, forwarded) => {
      config = nextConfig
      // The child's ref is attached BEFORE this parent's layout effect runs,
      // so the first `assignHandle` happened while there was nothing to
      // forward to. Publishing again here is what gets the handle into a ref
      // the child was given on its very first mount.
      const changed = forwarded !== forwardedRef
      forwardedRef = forwarded
      if (changed && handle !== null) {
        publish(handle)
      }
    },

    checkWidget: () => {
      if (widgetForHandle(handle) === null) {
        warnNoWidget()
      }
    },
  }
}
