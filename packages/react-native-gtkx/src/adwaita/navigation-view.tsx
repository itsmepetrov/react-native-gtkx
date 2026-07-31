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
// popped route immediately, while Adwaita still animates the page out for
// ~200 ms. If the consumer had to keep rendering pages it already considers
// gone, every consumer would reimplement that bookkeeping and the primitive
// would be useless without a router. So NavigationView snapshots a page when
// it leaves `stack` and drops it on the page's "hidden" signal, with a timer
// fallback for environments that never emit it (headless compositors with
// animations disabled).
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

/** Adwaita's page transition is ~200 ms; the fallback waits comfortably past
 *  it. Overridable because a consumer may disable animations. */
const DEFAULT_TRANSITION_MS = 400

type PageLifecycle = {
  reportHidden: (tag: string) => void
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
 * inside a page, wrap it in `PageContent` (see ./content) — the primitive
 * deliberately does not guess, so raw GTK children keep working.
 */
export const NavigationStackPage = ({
  tag,
  onHidden,
  ...rest
}: NavigationStackPageProps) => {
  const lifecycle = useContext(PageLifecycleContext)
  const handleHidden = ((...args: unknown[]) => {
    lifecycle?.reportHidden(tag)
    // The consumer's own handler still runs, and runs second: retention
    // bookkeeping must not depend on what the consumer does here.
    ;(onHidden as ((...a: unknown[]) => void) | undefined)?.(...args)
  }) as AdwPageProps["onHidden"]
  return (
    <RawAdwNavigationPage
      {...rest}
      tag={tag}
      onHidden={handleHidden}
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
   * The widget popped a page by itself: the Adwaita back button, Escape, the
   * back gesture, or the back-history menu. NOT called for pops you caused by
   * changing `stack`. This is where a router follows the view.
   */
  onPopped?: (tag: string) => void
  /** A closing page finished animating out and was dropped from the tree. */
  onPageClosed?: (tag: string) => void
  /** A push/pop/replace transition started. */
  onTransitionStart?: () => void
  /** …and finished (timer-based: Adwaita has no transition-end signal). */
  onTransitionEnd?: () => void
  /** Transition length in ms, used for retention and transition callbacks.
   *  Default 400. */
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

  const reportHidden = useCallback(
    (tag: string): void => {
      // "hidden" also fires for a live page covered by a push — only pages
      // gone from the requested stack are actually closing.
      if (stackRef.current.includes(tag)) {
        return
      }
      dropPage(tag)
    },
    [dropPage],
  )

  // Delivery of "hidden" is not guaranteed (headless compositors with
  // animations disabled never emit it), so a timer slightly longer than the
  // transition is the fallback. dropPage is idempotent: whichever wins, wins.
  const scheduleDrop = useCallback(
    (tag: string): void => {
      setTimeout(() => reportHidden(tag), transitionDuration)
    },
    [reportHidden, transitionDuration],
  )

  // Bracket every transition with an InteractionManager handle so
  // runAfterInteractions work (a screen's data load, a heavy render) waits
  // for the slide instead of stealing its frames. Overlapping transitions
  // reference-count through the handle API.
  const beginTransition = useCallback((): void => {
    const handle = InteractionManager.createInteractionHandle()
    onTransitionStart?.()
    setTimeout(() => {
      InteractionManager.clearInteractionHandle(handle)
      onTransitionEnd?.()
    }, transitionDuration)
  }, [onTransitionEnd, onTransitionStart, transitionDuration])

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
      // The root changed (a reset): swap the whole visible stack.
      const leaving = syncedRef.current.filter((tag) => !target.includes(tag))
      syncedRef.current = [...target]
      beginTransition()
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
        beginTransition()
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
      beginTransition()
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
  // live handler is reached through a ref rather than baked into the value.
  const reportHiddenRef = useRef<(tag: string) => void>(reportHidden)
  useInsertionEffect(() => {
    reportHiddenRef.current = reportHidden
  })
  const [lifecycle] = useState<PageLifecycle>(() => ({
    reportHidden: (tag: string) => reportHiddenRef.current(tag),
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
