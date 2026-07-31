// react-native-gtkx/adwaita — Adw.NavigationView as a declarative primitive.
//
// This layer knows NOTHING about react-navigation. You hand it the ordered
// stack of page tags you want visible, it animates the widget to that stack
// and tells you when the WIDGET popped on its own (back button, Escape, the
// back gesture). Bring react-navigation, bring your own router, or drive it
// from useState — the primitive does not care.
//
// react-native-gtkx/navigation is a thin adapter on top of this file, the
// same way @react-navigation/native-stack sits on top of react-native-screens.
//
// Why the primitive owns retention: react-navigation (and any router) drops a
// popped route immediately, while Adwaita still animates the page out. If the
// consumer had to keep rendering pages it already considers gone, every
// consumer would reimplement that bookkeeping and the primitive would be
// useless without a router. So NavigationView snapshots a page when it
// leaves `stack` and drops it on the page's "hidden" signal — the real
// AdwNavigationPage signal, not a guess — with `transitionDuration` as a
// fallback timer for two cases where the signal never arrives on its own:
// environments that never deliver it at all (headless compositors with
// animations disabled), and a page skipped entirely by a multi-hop pop
// (measured on the rig: `popToTag` from [a,b,c] to "a" fires hiding/hidden
// only on "c", the page that was actually visible — "b" gets no signal at
// all, on any environment, because it was never itself on screen during the
// transition). onTransitionStart/onTransitionEnd and the InteractionManager
// bracket around them use the exact same real-signal-first, timer-fallback
// mechanism — see beginTransition below.
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useInsertionEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from "react"
import { InteractionManager } from "../apis/interaction-manager"
import {
  AdwNavigationPage as RawAdwNavigationPage,
  AdwNavigationView as RawAdwNavigationView,
  type Adw,
} from "../gtkx/bridge/index"

/** A conservative fallback window for the two cases described above, where
 *  no real per-page signal ever arrives for this specific transition. This
 *  is NOT a measurement of Adwaita's actual transition length — an earlier
 *  version of this comment claimed "~200 ms measured", which was never
 *  actually measured (found while auditing this file). On the project's own
 *  headless GTK test rig the real signal always arrives, and in well under
 *  a millisecond, so there is no rig measurement to cite either; this
 *  number is simply a deliberately generous upper bound. Overridable
 *  because a consumer may want a shorter/longer safety margin. */
const DEFAULT_TRANSITION_MS = 400

type PageLifecycle = {
  reportHidden: (tag: string) => void
  reportShown: (tag: string) => void
}

const PageLifecycleContext = createContext<PageLifecycle | null>(null)

// Every prop Adw.NavigationPage exposes flows through untouched, so anything
// gtkx binds today (and anything it binds tomorrow) is reachable without a
// change here. Only `onHidden` is intercepted, and it is still forwarded.
type AdwPageProps = ComponentProps<typeof RawAdwNavigationPage>

export type NavigationStackPageProps = AdwPageProps & {
  /** Stable identity of this page inside the view. Required: the whole sync
   *  protocol is expressed in tags, and Adwaita itself pushes and pops by
   *  tag. Use the same string you put in NavigationView's `stack`. */
  tag: string
}

/**
 * One page of an {@link NavigationStack}.
 *
 * Children are passed to the widget untouched. To put React Native content
 * inside a page, wrap it in `SlotContent` (see ./content) — the primitive
 * deliberately does not guess, so raw GTK children keep working.
 */
export const NavigationStackPage = ({
  tag,
  onHidden,
  onShown,
  ...rest
}: NavigationStackPageProps) => {
  const lifecycle = useContext(PageLifecycleContext)
  const handleHidden = ((...args: unknown[]) => {
    lifecycle?.reportHidden(tag)
    // The consumer's own handler still runs, and runs second: retention
    // bookkeeping must not depend on what the consumer does here.
    ;(onHidden as ((...a: unknown[]) => void) | undefined)?.(...args)
  }) as AdwPageProps["onHidden"]
  const handleShown = ((...args: unknown[]) => {
    lifecycle?.reportShown(tag)
    // Same ordering guarantee as onHidden above.
    ;(onShown as ((...a: unknown[]) => void) | undefined)?.(...args)
  }) as AdwPageProps["onShown"]
  return (
    <RawAdwNavigationPage
      {...rest}
      tag={tag}
      onHidden={handleHidden}
      onShown={handleShown}
    />
  )
}

type AdwViewProps = ComponentProps<typeof RawAdwNavigationView>

export type NavigationStackProps = Omit<AdwViewProps, "onPopped" | "ref"> & {
  /**
   * The visible stack, root first, as page tags. Change it and the widget
   * animates to match: appended tags push, removed tags pop, a changed root
   * replaces the whole stack.
   */
  stack: readonly string[]
  /** `NavigationStackPage` elements. Pages not in `stack` are still accepted —
   *  they simply are not shown — so a router may render all of its screens. */
  children?: ReactNode
  /**
   * Whether push/pop/replace transitions animate at all, forwarded straight
   * to `Adw.NavigationView`'s own `animate-transitions` property (already
   * reachable through this component's inherited `Adw.NavigationView` props —
   * spelled out here because it is the one prop consumers most often go
   * looking for). GTK has exactly one transition style; there is no per-style
   * choice to make here, only whether it plays. Default true, matching the
   * widget's own default. Interactive swipe-back gestures always animate
   * regardless of this value — that is Adwaita's own behavior, not this
   * primitive's.
   */
  animateTransitions?: boolean
  /**
   * The widget popped a page by itself: the Adwaita back button, Escape, the
   * back gesture, or the back-history menu. NOT called for pops you caused by
   * changing `stack`. This is where a router follows the view.
   */
  onPopped?: (tag: string) => void
  /** A closing page finished animating out and was dropped from the tree. */
  onPageClosed?: (tag: string) => void
  /** A push/pop/replace transition started. */
  onTransitionStart?: () => void
  /** …and finished. Driven by the transitioning page's own real
   *  `shown`/`hidden` AdwNavigationPage signal (whichever settles it —
   *  see beginTransition), with `transitionDuration` as a fallback for the
   *  cases where neither arrives. */
  onTransitionEnd?: () => void
  /** Fallback window in ms, used only when a page's own transition signal
   *  never arrives (see the file header comment for the two cases this
   *  covers) — for page retention and for the transition callbacks above.
   *  NOT a measurement of the real transition length. Default 400. */
  transitionDuration?: number
  /** Escape hatch: the underlying Adw.NavigationView, for anything this
   *  primitive does not model. */
  ref?: Ref<Adw.NavigationView | null>
}

/**
 * `Adw.NavigationView` driven declaratively.
 *
 * ```tsx
 * const [stack, setStack] = useState(["home"])
 *
 * <NavigationStack
 *   stack={stack}
 *   onPopped={(tag) => setStack((s) => s.filter((t) => t !== tag))}
 * >
 *   <NavigationStackPage tag="home" title="Home">…</NavigationStackPage>
 *   <NavigationStackPage tag="detail" title="Detail">…</NavigationStackPage>
 * </NavigationStack>
 * ```
 *
 * No router required. `react-native-gtkx/navigation` uses exactly this
 * component to back `createStackNavigator`.
 */
export const NavigationStack = ({
  stack,
  children,
  onPopped,
  onPageClosed,
  onTransitionStart,
  onTransitionEnd,
  transitionDuration = DEFAULT_TRANSITION_MS,
  ref,
  ...rest
}: NavigationStackProps) => {
  const viewRef = useRef<Adw.NavigationView | null>(null)
  // Mirror of the widget's visible stack. Maintained by the sync effect and
  // by the popped handler; the two never race, because GTK signals run
  // synchronously inside the very push/pop calls the effect makes.
  const syncedRef = useRef<string[]>([])

  const pagesByTag = new Map<string, ReactNode>()
  for (const child of Children.toArray(children)) {
    if (isValidElement<{ tag?: unknown }>(child)) {
      const tag = child.props.tag
      if (typeof tag === "string") {
        pagesByTag.set(tag, child)
      }
    }
  }

  // Pages currently in the tree: everything in `stack`, plus pages that left
  // it and are still animating out.
  const [renderedTags, setRenderedTags] = useState<string[]>(() => [...stack])
  const missing = stack.filter((tag) => !renderedTags.includes(tag))
  if (missing.length > 0) {
    // The sanctioned derive-state-during-render pattern: a new page must be
    // in the tree within the same commit the sync effect pushes it.
    setRenderedTags([...renderedTags, ...missing])
  }

  // A state-held stable Map rather than a ref: the render path reads it for
  // closing pages, and reading a ref during render is rightly banned.
  const [snapshots] = useState(() => new Map<string, ReactNode>())
  useEffect(() => {
    for (const [tag, element] of pagesByTag) {
      snapshots.set(tag, element)
    }
  })

  const dropPage = useCallback(
    (tag: string): void => {
      let dropped = false
      setRenderedTags((tags) => {
        if (!tags.includes(tag)) {
          return tags
        }
        dropped = true
        return tags.filter((rendered) => rendered !== tag)
      })
      if (dropped) {
        snapshots.delete(tag)
        onPageClosed?.(tag)
      }
    },
    [onPageClosed, snapshots],
  )

  // Signal handlers read the CURRENT requested stack, not the one captured
  // when they were created. Refreshed in an insertion effect (the project's
  // standard escape from writing refs during render): insertion effects run
  // before layout effects, so the value is fresh by the time GTK can emit.
  const stackRef = useRef<readonly string[]>(stack)
  useInsertionEffect(() => {
    stackRef.current = stack
  })

  // Per-tag waiters for "this specific page's transition settled" — fed by
  // reportHidden/reportShown below, drained (and deleted) the moment either
  // fires. A page can end up "shown" after being "hiding" (an interrupted
  // pop reversed) or "hidden" after being "showing" (an interrupted push
  // superseded) — GObject-introspection documents both pairings — so a
  // waiter for a given tag resolves on WHICHEVER of the two settles it,
  // not just the one that would be expected in the common case.
  const transitionWaitersRef = useRef<Map<string, Array<() => void>>>(new Map())

  const addTransitionWaiter = useCallback(
    (tag: string, resolve: () => void): void => {
      const waiters = transitionWaitersRef.current.get(tag)
      if (waiters) {
        waiters.push(resolve)
      } else {
        transitionWaitersRef.current.set(tag, [resolve])
      }
    },
    [],
  )

  const removeTransitionWaiter = useCallback(
    (tag: string, resolve: () => void): void => {
      const waiters = transitionWaitersRef.current.get(tag)
      if (!waiters) {
        return
      }
      const next = waiters.filter((waiter) => waiter !== resolve)
      if (next.length > 0) {
        transitionWaitersRef.current.set(tag, next)
      } else {
        transitionWaitersRef.current.delete(tag)
      }
    },
    [],
  )

  const resolveTransitionWaiters = useCallback((tag: string): void => {
    const waiters = transitionWaitersRef.current.get(tag)
    if (!waiters) {
      return
    }
    transitionWaitersRef.current.delete(tag)
    for (const resolve of waiters) {
      resolve()
    }
  }, [])

  const reportHidden = useCallback(
    (tag: string): void => {
      resolveTransitionWaiters(tag)
      // "hidden" also fires for a live page covered by a push — only pages
      // gone from the requested stack are actually closing.
      if (stackRef.current.includes(tag)) {
        return
      }
      dropPage(tag)
    },
    [dropPage, resolveTransitionWaiters],
  )

  const reportShown = useCallback(
    (tag: string): void => {
      resolveTransitionWaiters(tag)
    },
    [resolveTransitionWaiters],
  )

  // Delivery of "hidden" is not guaranteed — see the file header comment for
  // the two cases (a genuinely signal-less environment, and a page skipped
  // over by a multi-hop pop) — so a timer slightly longer than the fallback
  // window is the backstop. dropPage is idempotent: whichever wins, wins.
  const scheduleDrop = useCallback(
    (tag: string): void => {
      setTimeout(() => reportHidden(tag), transitionDuration)
    },
    [reportHidden, transitionDuration],
  )

  // Bracket every transition with an InteractionManager handle so
  // runAfterInteractions work (a screen's data load, a heavy render) waits
  // for the slide instead of stealing its frames, closing it and firing
  // onTransitionEnd exactly when the transition really settles: the real
  // "shown"/"hidden" signal on `targetTag` (the page this specific push,
  // popToTag or replaceWithTags call is bringing into view) if it arrives,
  // `transitionDuration` otherwise. `targetTag` is undefined only for
  // replaceWithTags([]) — no page becomes visible, nothing to wait on, the
  // timer alone settles it. Overlapping transitions reference-count through
  // the handle API.
  const beginTransition = useCallback(
    (targetTag: string | undefined): void => {
      const handle = InteractionManager.createInteractionHandle()
      onTransitionStart?.()
      let settled = false
      const settle = (): void => {
        if (settled) {
          return
        }
        settled = true
        InteractionManager.clearInteractionHandle(handle)
        onTransitionEnd?.()
      }
      if (targetTag !== undefined) {
        addTransitionWaiter(targetTag, settle)
      }
      setTimeout(() => {
        if (targetTag !== undefined) {
          removeTransitionWaiter(targetTag, settle)
        }
        settle()
      }, transitionDuration)
    },
    [
      addTransitionWaiter,
      removeTransitionWaiter,
      onTransitionEnd,
      onTransitionStart,
      transitionDuration,
    ],
  )

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }
    const target = [...stack]
    if (syncedRef.current.length === 0 && target.length > 0) {
      // First mount: NavigationView shows the first added page by itself.
      syncedRef.current = target.slice(0, 1)
    }
    let common = 0
    while (
      common < syncedRef.current.length &&
      common < target.length &&
      syncedRef.current[common] === target[common]
    ) {
      common += 1
    }
    if (common === 0 && syncedRef.current[0] !== target[0]) {
      // The root changed (a reset): swap the whole visible stack. The last
      // tag becomes the visible page (undefined only when target is empty —
      // see beginTransition's targetTag doc above).
      const leaving = syncedRef.current.filter((tag) => !target.includes(tag))
      syncedRef.current = [...target]
      beginTransition(target[target.length - 1])
      view.replaceWithTags(target)
      for (const tag of leaving) {
        scheduleDrop(tag)
      }
      return
    }
    if (syncedRef.current.length > common) {
      const anchor = target[common - 1]
      const leaving = syncedRef.current.slice(common)
      syncedRef.current = syncedRef.current.slice(0, common)
      if (anchor !== undefined) {
        beginTransition(anchor)
        view.popToTag(anchor)
      }
      for (const tag of leaving) {
        scheduleDrop(tag)
      }
    }
    for (
      let index = syncedRef.current.length;
      index < target.length;
      index += 1
    ) {
      const tag = target[index]!
      syncedRef.current.push(tag)
      beginTransition(tag)
      view.pushByTag(tag)
    }
  }, [stack, scheduleDrop, beginTransition])

  const handlePopped = (page: Adw.NavigationPage | null): void => {
    const tag = page?.getTag()
    if (!tag) {
      return
    }
    syncedRef.current = syncedRef.current.filter((synced) => synced !== tag)
    // Reported unconditionally: the consumer decides whether this pop was
    // one it already knows about. The primitive has no router state to
    // consult, and guessing here is exactly what would couple the layers.
    onPopped?.(tag)
    scheduleDrop(tag)
  }

  // The context value must be identity-stable (every page reads it), so the
  // live handlers are reached through refs rather than baked into the value.
  const reportHiddenRef = useRef<(tag: string) => void>(reportHidden)
  const reportShownRef = useRef<(tag: string) => void>(reportShown)
  useInsertionEffect(() => {
    reportHiddenRef.current = reportHidden
    reportShownRef.current = reportShown
  })
  const [lifecycle] = useState<PageLifecycle>(() => ({
    reportHidden: (tag: string) => reportHiddenRef.current(tag),
    reportShown: (tag: string) => reportShownRef.current(tag),
  }))

  return (
    <PageLifecycleContext.Provider value={lifecycle}>
      <RawAdwNavigationView
        {...rest}
        ref={(instance: Adw.NavigationView | null) => {
          viewRef.current = instance
          if (typeof ref === "function") {
            ref(instance)
          } else if (ref) {
            ref.current = instance
          }
        }}
        onPopped={(page: Adw.NavigationPage | null) => handlePopped(page)}
      >
        {renderedTags.map(
          (tag) => pagesByTag.get(tag) ?? snapshots.get(tag) ?? null,
        )}
      </RawAdwNavigationView>
    </PageLifecycleContext.Provider>
  )
}
