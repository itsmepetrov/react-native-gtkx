// RN's Gesture Responder System: the negotiation, in pure JS.
//
// Zero @gtkx imports on purpose. Everything platform-specific enters through
// two seams — `parentOf`, which turns a host handle into its parent, and the
// grant/release notifications the platform uses to make its one-way GTK
// claim. That keeps the algorithm unit-testable off Linux, which matters
// because this is the part that is subtle and the part every platform
// historically gets wrong.
//
// Why reimplemented rather than reused: every other RN platform feeds
// `topTouchStart/Move/End/Cancel` to the stock renderer's
// ResponderEventPlugin, which lives in `facebook/react` inside
// `react-native-renderer`. We render through `@gtkx/react` on
// `react-reconciler`, so there is no plugin seam to feed —
// react-native-web is in the same position and reimplemented for the same
// reason (docs/research/gestures.md).
import type { NativeTouch } from "../components/press-event"
import {
  createTouchHistory,
  recordTouchEnd,
  recordTouchMove,
  recordTouchStart,
  refreshActiveTouches,
} from "./touch-history"
import type { GestureResponderEvent, ResponderProps } from "./types"

/** An opaque platform handle. A Gtk.Widget in practice; never treated as one. */
export type ResponderHost = object

export type ResponderSystemOptions = {
  /** The platform's parent link. Returning null ends the path. */
  parentOf: (host: ResponderHost) => ResponderHost | null
  /**
   * Fired after a node is granted the responder — where the platform makes
   * its GTK `CLAIMED` declaration. One-way by construction: GTK has no way
   * to hand a claimed sequence back, so this is only ever called once JS has
   * already decided (docs/research/gestures.md, "no voluntary release").
   */
  onGrant?: (host: ResponderHost) => void
  /** Fired when the responder is released or terminated. */
  onRelease?: (host: ResponderHost) => void
}

type Registration = { getProps: () => ResponderProps }

// One interaction, from press to release. v1 is single-pointer: a mouse is
// one fabricated touch, so at most one session exists at a time. It also
// does the deduplicating — GTK delivers a press to every ancestor's gesture
// in the bubble chain, so the second and later reports for the same press
// find a session already open and return.
type Session = { host: ResponderHost; identifier: number }

export type ResponderSystem = {
  register(host: ResponderHost, getProps: () => ResponderProps): () => void
  touchStart(host: ResponderHost, touch: NativeTouch): void
  touchMove(host: ResponderHost, touch: NativeTouch): void
  touchEnd(host: ResponderHost, touch: NativeTouch): void
  touchCancel(host: ResponderHost, touch: NativeTouch): void
  /** The node currently holding the responder, or null. */
  getResponder(): ResponderHost | null
}

type ShouldSetName =
  | "onStartShouldSetResponder"
  | "onStartShouldSetResponderCapture"
  | "onMoveShouldSetResponder"
  | "onMoveShouldSetResponderCapture"

type NotifyName =
  | "onResponderGrant"
  | "onResponderStart"
  | "onResponderMove"
  | "onResponderEnd"
  | "onResponderRelease"
  | "onResponderTerminate"
  | "onResponderReject"

type TouchName =
  | "onTouchStart"
  | "onTouchStartCapture"
  | "onTouchMove"
  | "onTouchMoveCapture"
  | "onTouchEnd"
  | "onTouchEndCapture"
  | "onTouchCancel"
  | "onTouchCancelCapture"

export const createResponderSystem = (
  options: ResponderSystemOptions,
): ResponderSystem => {
  const registry = new Map<ResponderHost, Registration>()
  const history = createTouchHistory()
  let responder: ResponderHost | null = null
  let session: Session | null = null

  /**
   * The registered nodes from the toplevel down to `host`, root first — RN's
   * capture order, reversed for bubble.
   *
   * The walk stops wherever `parentOf` stops, which on this platform is the
   * layout Root: an RN tree here is an island inside a native GTK widget
   * tree (NestedRoot/IntrinsicRoot mount engines into arbitrary GTK slots),
   * so there is no single app-wide view hierarchy to traverse. Native
   * widgets on the way up are simply not registered and take no part.
   */
  const pathOf = (host: ResponderHost): ResponderHost[] => {
    const path: ResponderHost[] = []
    let current: ResponderHost | null = host
    while (current) {
      if (registry.has(current)) {
        path.unshift(current)
      }
      current = options.parentOf(current)
    }
    return path
  }

  const propsOf = (host: ResponderHost): ResponderProps | null =>
    registry.get(host)?.getProps() ?? null

  const createEvent = (
    touch: NativeTouch,
    stillDown: boolean,
  ): GestureResponderEvent => ({
    nativeEvent: {
      ...touch,
      // Single-pointer: `touches` is the still-active set (empty once the
      // pointer is up), `changedTouches` is always this one.
      touches: stillDown ? [touch] : [],
      changedTouches: [touch],
    },
    touchHistory: history,
  })

  /**
   * Runs a should-set handler over `path` in order, stopping at the first
   * that returns true — RN's executeDispatchesInOrderStopAtTrue. Handlers
   * before the winner all run, which PanResponder depends on: its capture
   * handlers are where gestureState is initialised and where dx/dy are
   * accumulated on move.
   */
  const firstToClaim = (
    path: readonly ResponderHost[],
    name: ShouldSetName,
    event: GestureResponderEvent,
  ): ResponderHost | null => {
    for (const host of path) {
      const handler = propsOf(host)?.[name]
      if (handler?.(event) === true) {
        return host
      }
    }
    return null
  }

  const notify = (
    host: ResponderHost,
    name: NotifyName,
    event: GestureResponderEvent,
  ): void => {
    propsOf(host)?.[name]?.(event)
  }

  const dispatchTouch = (
    path: readonly ResponderHost[],
    captureName: TouchName,
    bubbleName: TouchName,
    event: GestureResponderEvent,
  ): void => {
    for (const host of path) {
      propsOf(host)?.[captureName]?.(event)
    }
    for (let i = path.length - 1; i >= 0; i -= 1) {
      propsOf(path[i]!)?.[bubbleName]?.(event)
    }
  }

  const grant = (
    host: ResponderHost,
    event: GestureResponderEvent,
    fromStart: boolean,
  ): void => {
    responder = host
    notify(host, "onResponderGrant", event)
    if (fromStart) {
      notify(host, "onResponderStart", event)
    }
    options.onGrant?.(host)
  }

  /**
   * Capture root-to-target, then bubble target-to-root — RN's two-phase
   * negotiation, and the one place GTK's model and RN's agree, since GTK's
   * CAPTURE/TARGET/BUBBLE phases run in exactly this order. We still do the
   * walk ourselves so a single GTK event source can drive the whole path.
   */
  const negotiate = (
    path: readonly ResponderHost[],
    event: GestureResponderEvent,
    phase: "start" | "move",
  ): ResponderHost | null => {
    const capture =
      phase === "start"
        ? "onStartShouldSetResponderCapture"
        : "onMoveShouldSetResponderCapture"
    const bubble =
      phase === "start"
        ? "onStartShouldSetResponder"
        : "onMoveShouldSetResponder"
    const captured = firstToClaim(path, capture, event)
    if (captured) {
      return captured
    }
    return firstToClaim([...path].reverse(), bubble, event)
  }

  const finish = (
    touch: NativeTouch,
    terminated: boolean,
    touchProps: [TouchName, TouchName],
  ): void => {
    const current = session
    if (!current) {
      return
    }
    recordTouchEnd(history, touch)
    refreshActiveTouches(history)
    const event = createEvent(touch, false)
    dispatchTouch(pathOf(current.host), touchProps[0], touchProps[1], event)

    const holder = responder
    session = null
    responder = null
    if (holder) {
      notify(holder, "onResponderEnd", event)
      notify(
        holder,
        terminated ? "onResponderTerminate" : "onResponderRelease",
        event,
      )
      options.onRelease?.(holder)
    }
  }

  return {
    register(host, getProps) {
      registry.set(host, { getProps })
      return () => {
        registry.delete(host)
        // A responder that unmounts mid-gesture cannot be asked anything
        // ever again; drop the lock rather than stranding it.
        if (responder === host) {
          responder = null
        }
        if (session?.host === host) {
          session = null
        }
      }
    },

    touchStart(host, touch) {
      // Already tracking this press: this is an ancestor's gesture seeing the
      // same event through GTK's bubble chain.
      if (session !== null) {
        return
      }
      session = { host, identifier: touch.identifier }
      recordTouchStart(history, touch)
      refreshActiveTouches(history)

      const path = pathOf(host)
      const event = createEvent(touch, true)
      dispatchTouch(path, "onTouchStartCapture", "onTouchStart", event)

      if (responder !== null) {
        return
      }
      const winner = negotiate(path, event, "start")
      if (winner) {
        grant(winner, event, true)
      }
    },

    touchMove(host, touch) {
      if (session === null || session.host !== host) {
        return
      }
      recordTouchMove(history, touch)
      refreshActiveTouches(history)

      const path = pathOf(host)
      const event = createEvent(touch, true)
      dispatchTouch(path, "onTouchMoveCapture", "onTouchMove", event)

      if (responder === null) {
        // The common PanResponder shape: nothing claims on press, and the
        // pan starts once onMoveShouldSetPanResponder sees enough movement.
        const winner = negotiate(path, event, "move")
        if (winner) {
          grant(winner, event, false)
        }
        return
      }
      // v1 deliberately does not renegotiate while a responder holds: GTK
      // cannot revoke a claim, so a transfer we cannot enforce natively would
      // be a lie at the boundary with native widgets. Tracked as task 002b.
      notify(responder, "onResponderMove", event)
    },

    touchEnd(host, touch) {
      if (session === null || session.host !== host) {
        return
      }
      finish(touch, false, ["onTouchEndCapture", "onTouchEnd"])
    },

    touchCancel(host, touch) {
      if (session === null || session.host !== host) {
        return
      }
      finish(touch, true, ["onTouchCancelCapture", "onTouchCancel"])
    },

    getResponder: () => responder,
  }
}
