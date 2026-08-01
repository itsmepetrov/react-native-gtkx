// RN's Gesture Responder System: the negotiation, in pure JS.
//
// Zero @gtkx imports on purpose. Everything platform-specific enters through
// two seams — `parentOf`, which turns a host handle into its parent, and
// `onClaim`, the one-way GTK declaration the platform makes once per
// interaction. That keeps the algorithm unit-testable off Linux, which
// matters because this is the part that is subtle and the part every
// platform historically gets wrong.
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

/**
 * Why the responder was taken away by something that is not a pointer event.
 *
 * react-native-web's list is longer — cancel-ish events, context menu,
 * window blur, ancestor scroll, selection change — and measuring GTK
 * collapsed most of it. GTK cancels a single-button gesture the instant a
 * second button goes down, and a widget that steals a sequence (a
 * selectable label, a `GtkDragSource` attached through `Controllers`)
 * cancels it too, so "context menu" and "selection change" both arrive as
 * an ordinary `::cancel` on the event source and need no trigger of their
 * own. What is left needs asking for:
 *
 * - `"blur"`: the toplevel stopped being the active window. Not a question,
 *   in RN or here — the window is gone either way.
 * - `"scroll"`: an ancestor scroller moved under the gesture. The one
 *   termination a holder may refuse, and therefore the only place
 *   `onResponderTerminationRequest` is consulted outside a transfer (PRD
 *   crux 2: GTK's `CLAIMED` is irrevocable, so anything GTK has already
 *   taken cannot be given back no matter what the holder answers).
 */
export type TerminationReason = "blur" | "scroll"

export type ResponderSystemOptions = {
  /** The platform's parent link. Returning null ends the path. */
  parentOf: (host: ResponderHost) => ResponderHost | null
  /**
   * Fired at most ONCE per interaction, the first time any node is granted
   * the responder — where the platform makes its GTK `CLAIMED` declaration.
   *
   * Its argument is the node whose event source is carrying the interaction,
   * NOT the node that won the responder. Those differ whenever an ancestor
   * claims (the common `onMoveShouldSetPanResponder` shape), and claiming on
   * the ancestor is actively wrong: GTK denies the sequence on every gesture
   * below the one that claims, which kills the very source the interaction
   * is arriving through. What GTK is being told is "this interaction belongs
   * to React Native, native widgets keep off" — a statement about the
   * island, not about which view inside it currently holds the lock, which
   * is a JS matter GTK has no way to represent.
   *
   * One-way by construction: GTK has no way to hand a claimed sequence back,
   * so this only ever runs once JS has already decided (see
   * docs/research/gestures.md, "no voluntary release").
   */
  onClaim?: (source: ResponderHost) => void
}

type Registration = { getProps: () => ResponderProps }

// One interaction, from press to release. v1 is single-pointer: a mouse is
// one fabricated touch, so at most one session exists at a time. It also
// does the deduplicating — GTK delivers a press to every ancestor's gesture
// in the bubble chain, so the second and later reports for the same press
// find a session already open and return.
//
// `lastTouch` exists for termination: a window losing focus is not a pointer
// event, and `onResponderTerminate` still has to be handed an RN-shaped
// event. The last known position is what RN reports there too.
type Session = {
  host: ResponderHost
  identifier: number
  lastTouch: NativeTouch
  claimed: boolean
}

export type ResponderSystem = {
  register(host: ResponderHost, getProps: () => ResponderProps): () => void
  touchStart(host: ResponderHost, touch: NativeTouch): void
  touchMove(host: ResponderHost, touch: NativeTouch): void
  touchEnd(host: ResponderHost, touch: NativeTouch): void
  touchCancel(host: ResponderHost, touch: NativeTouch): void
  /**
   * Something that is not a pointer event took the interaction. Returns
   * whether the responder was actually given up — `false` means either
   * nothing held it or the holder refused a reason that allows refusal.
   */
  terminate(reason: TerminationReason): boolean
  /** The node currently holding the responder, or null. */
  getResponder(): ResponderHost | null
  /** The node whose event source is carrying the interaction, or null. */
  getSource(): ResponderHost | null
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

  const grant = (host: ResponderHost, event: GestureResponderEvent): void => {
    responder = host
    notify(host, "onResponderGrant", event)
    // The GTK claim is per INTERACTION, not per grant: a transfer moves a JS
    // lock, and there is nothing left to tell GTK once the sequence is
    // already ours. Claiming again on the new holder's own gesture would
    // deny the sequence on the source below it and silently end the drag.
    if (session && !session.claimed) {
      session.claimed = true
      options.onClaim?.(session.host)
    }
  }

  /**
   * The negotiation path when someone already holds the responder: RN prunes
   * it to the lowest common ancestor of the holder and the event target, and
   * then skips the holder itself so it is never asked whether it wants what
   * it already has. Pruning is what makes the lock transferable only
   * UPWARDS — a descendant of the holder is not on the pruned path and
   * cannot take it, which is RN's documented rule.
   *
   * Returns null when the two paths are disjoint (RNW's `lowestCommonAncestor
   * == null`): nothing may take the responder in that case.
   */
  const pruneToAncestors = (
    path: readonly ResponderHost[],
    holder: ResponderHost,
  ): ResponderHost[] | null => {
    const holderPath = pathOf(holder)
    let common = -1
    const shared = Math.min(path.length, holderPath.length)
    for (let i = 0; i < shared && path[i] === holderPath[i]; i += 1) {
      common = i
    }
    if (common === -1) {
      return null
    }
    return path.slice(0, path[common] === holder ? common : common + 1)
  }

  /**
   * RN's handoff, in react-native-web's order: ask the holder, then
   * terminate it, then grant. (Upstream's ResponderEventPlugin dispatches
   * the grant BEFORE asking, so a rejected candidate still sees
   * `onResponderGrant` — a quirk of the pooled-event implementation rather
   * than of the model. RN's own documentation diagram, which RNW reproduces
   * verbatim, shows TerminationRequest -> GRANT, and that is what we do.)
   *
   * A holder with no `onResponderTerminationRequest` always yields: absent
   * means "sure", in RN and in RNW alike.
   */
  const attemptTransfer = (
    winner: ResponderHost,
    event: GestureResponderEvent,
  ): void => {
    const holder = responder
    if (holder === null) {
      grant(winner, event)
      return
    }
    if (holder === winner) {
      return
    }
    if (propsOf(holder)?.onResponderTerminationRequest?.(event) === false) {
      notify(winner, "onResponderReject", event)
      return
    }
    notify(holder, "onResponderTerminate", event)
    responder = null
    grant(winner, event)
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

  /**
   * The whole negotiation for one event: prune the path if the lock is held,
   * ask who wants it, hand it over. Returns nothing — the caller reads
   * `responder` afterwards, because RN dispatches `onResponderStart`/`Move`
   * to whoever holds the lock AFTER the handoff, not before it.
   */
  const negotiateAndTransfer = (
    path: readonly ResponderHost[],
    event: GestureResponderEvent,
    phase: "start" | "move",
  ): void => {
    const holder = responder
    const candidates = holder === null ? path : pruneToAncestors(path, holder)
    if (candidates === null || candidates.length === 0) {
      return
    }
    const winner = negotiate(candidates, event, phase)
    if (winner) {
      attemptTransfer(winner, event)
    }
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
      session = {
        host,
        identifier: touch.identifier,
        lastTouch: touch,
        claimed: false,
      }
      recordTouchStart(history, touch)
      refreshActiveTouches(history)

      const path = pathOf(host)
      const event = createEvent(touch, true)
      dispatchTouch(path, "onTouchStartCapture", "onTouchStart", event)

      negotiateAndTransfer(path, event, "start")
      // RN dispatches this to whoever holds the lock once the handoff is
      // over, which is why it is not folded into grant(): a view granted on
      // a MOVE must not be told the interaction just started.
      if (responder !== null) {
        notify(responder, "onResponderStart", event)
      }
    },

    touchMove(host, touch) {
      if (session === null || session.host !== host) {
        return
      }
      session.lastTouch = touch
      recordTouchMove(history, touch)
      refreshActiveTouches(history)

      const path = pathOf(host)
      const event = createEvent(touch, true)
      dispatchTouch(path, "onTouchMoveCapture", "onTouchMove", event)

      // Two shapes go through here. Nobody holds the lock yet: the common
      // PanResponder one, where the pan starts once
      // onMoveShouldSetPanResponder sees enough movement. Somebody does: an
      // ancestor may still take it over, and the move is then delivered to
      // whoever ends up holding it — including in the same event as the
      // handoff, exactly as RN's own state diagram shows.
      negotiateAndTransfer(path, event, "move")
      if (responder !== null) {
        notify(responder, "onResponderMove", event)
      }
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

    terminate(reason) {
      const current = session
      const holder = responder
      if (current === null || holder === null) {
        // Nothing holds the lock: an ancestor scrolling or a menu opening is
        // then simply an ancestor scrolling or a menu opening. RN terminates
        // a RESPONDER; it has nothing to say when there is not one.
        return false
      }
      const event = createEvent(current.lastTouch, false)
      if (
        reason === "scroll" &&
        propsOf(holder)?.onResponderTerminationRequest?.(event) === false
      ) {
        return false
      }

      // No onResponderEnd here, and that is RN's shape rather than an
      // oversight: End pairs with a touch actually ending. A termination
      // that is not a pointer event goes straight to Terminate.
      recordTouchEnd(history, current.lastTouch)
      refreshActiveTouches(history)
      session = null
      responder = null
      notify(holder, "onResponderTerminate", event)
      return true
    },

    getResponder: () => responder,
    getSource: () => session?.host ?? null,
  }
}
