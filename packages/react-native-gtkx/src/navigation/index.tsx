// react-native-gtkx/navigation — a react-navigation stack navigator backed
// by the Adw.NavigationView primitive from react-native-gtkx/adwaita.
//
// This file is an ADAPTER and nothing else. Every widget concern — diffing
// the tag stack into pushes and pops, holding a popped page alive until its
// exit animation ends, bracketing transitions — lives in the primitive. What
// stays here is exactly the react-navigation half:
//
// - state → the ordered tags handed to NavigationStack (route keys);
// - a native pop (back button, Escape, back gesture) → StackActions.pop,
//   but only when the tag is still in state, otherwise the pop was one WE
//   caused and echoing it would double-pop;
// - descriptors → page titles, header content and canPop;
// - unknown-option warnings.
//
// The same split as @react-navigation/native-stack over react-native-screens.
// If you do not want a router, use the primitive directly.
import {
  createNavigatorFactory,
  StackActions,
  StackRouter,
  useNavigationBuilder,
  usePreventRemoveContext,
  type NavigationProp,
  type NavigatorTypeBagBase,
  type NavigatorTypeBagFor,
  type ParamListBase,
  type RouteProp,
  type StackNavigationState,
  type TypedNavigator,
} from "@react-navigation/native"
import { useEffect, useRef, type ComponentType, type ReactNode } from "react"
import { getActiveChrome } from "../components/app-registry"
import { AdwHeaderBar, AdwToolbarView } from "../adw"
import {
  IntrinsicContent,
  NavigationStack,
  NavigationStackPage,
  SlotContent,
} from "../common"
import { GtkButton } from "../gtkx/bridge/index"
import { warnIgnoredOptions } from "./option-warnings"
import type { HeaderButton } from "./sidebar"

const STACK_OPTION_KEYS: ReadonlySet<string> = new Set([
  "title",
  "headerShown",
  "headerButtons",
  "headerLeft",
  "headerRight",
  "gestureEnabled",
  "animation",
])

export type StackNavigationOptions = {
  /** AdwHeaderBar title; defaults to the route name. */
  title?: string
  /** Render the Adwaitan AdwHeaderBar for this screen (default true). */
  headerShown?: boolean
  /** Buttons packed at the end of this screen's AdwHeaderBar (see
   *  HeaderButton); screens usually set them via navigation.setOptions. */
  headerButtons?: HeaderButton[]
  /** RN content packed at the start of the AdwHeaderBar (an intrinsic-size
   *  layout root: the content's Yoga size IS the slot size). */
  headerLeft?: () => ReactNode
  /** RN content packed at the end of the AdwHeaderBar, before headerButtons. */
  headerRight?: () => ReactNode
  /** false disables the native back button, Escape and the back gesture
   *  for this screen (the page's Adwaita can-pop). Programmatic goBack
   *  still works. Also the mechanism behind usePreventRemove. */
  gestureEnabled?: boolean
  /**
   * `"none"` turns transitions off; any other value (including the
   * `@react-navigation/native-stack` style names like `"slide_from_bottom"`
   * or `"fade"`) turns them on. GTK has exactly one transition style, so a
   * specific requested type cannot be honored — only whether to animate at
   * all can be. Requesting a specific (non-`"default"`) type still animates,
   * with the standard Adwaita transition, and warns once in development.
   * Read from whichever screen is currently on top of the visible stack, so
   * setting it uniformly via `screenOptions` is the reliable way to use it —
   * see docs/api.md.
   */
  animation?: string
}

// Matches @react-navigation/stack's and @react-navigation/native-stack's
// own NativeStackNavigationEventMap/StackNavigationEventMap exactly (both
// verified against their v8 source — this package is not a dependency, so
// docs cannot be trusted here, see docs/api.md and 007.md). `closing` is
// false for a route becoming visible (pushed) and true for a route leaving
// the visible stack (popped); a route whose visibility does not change
// (e.g. the screen covered by a push) never receives either event — an app
// that listens for `transitionEnd` gets the identical event name and
// payload shape it would get on iOS or Android.
export type StackNavigationEventMap = {
  /** Fires when a push/pop/replace transition starts, once per involved
   *  route (not once per gesture or user tap). */
  transitionStart: { data: { closing: boolean } }
  /** Fires when the transition settles, driven by the page's own real
   *  `shown`/`hidden` AdwNavigationPage signal (see docs/api.md and the
   *  primitive's beginTransition) — not a timer, except as a fallback for
   *  the rare cases where neither signal arrives. Native pops (back
   *  button, Escape, back gesture) do not fire this at all today — see
   *  docs/api.md. */
  transitionEnd: { data: { closing: boolean } }
}

type StackDescriptor = {
  options: StackNavigationOptions
  render: () => ReactNode
  // react-navigation hands every descriptor its own route.
  route: { key: string; name: string }
}

type StackNavigatorProps = {
  initialRouteName?: string
  screenOptions?: StackNavigationOptions
  children: ReactNode
}

const StackNavigator = ({
  initialRouteName,
  screenOptions,
  children,
}: StackNavigatorProps) => {
  const { state, descriptors, navigation, NavigationContent } =
    useNavigationBuilder<
      StackNavigationState<ParamListBase>,
      Record<string, unknown>,
      Record<string, () => void>,
      StackNavigationOptions,
      StackNavigationEventMap
    >(StackRouter, {
      initialRouteName,
      screenOptions,
      children,
    })

  // React Navigation 8: `state.routes` is no longer just the visible stack —
  // it is active routes followed by retained routes (closing, kept mounted
  // for `inactiveBehavior`) and preloaded routes (`navigation.preload()`,
  // not yet navigated to), all concatenated, with the focused/visible tail
  // ending at `state.index` (see StackRouter's `getStateWithRoutes`: `routes:
  // activeRoutes.concat(retainedRoutes, preloadedRoutes)`, `index:
  // activeRoutes.length - 1`). Handing the whole array to NavigationStack
  // would push a preloaded screen onto the widget as if it were a real page
  // the user navigated to. Only the active slice is the visible stack.
  const visibleRoutes = state.routes.slice(0, state.index + 1)
  const visibleKeys = visibleRoutes.map((route) => route.key)

  // GTK has exactly one transition style and one animate-transitions switch
  // for the whole view — there is no per-route knob to hand it. The screen
  // actually being navigated TO is the natural read of "the currently
  // relevant animation option": for a push, that is the new top of stack;
  // for a pop, the screen the pop reveals. An app that sets `animation`
  // uniformly through `screenOptions` (the common case for "turn animation
  // off entirely") gets the same value everywhere, so this only matters
  // when different screens genuinely disagree.
  const activeRouteKey = visibleKeys[visibleKeys.length - 1]
  const activeDescriptor = activeRouteKey
    ? (descriptors[activeRouteKey] as StackDescriptor | undefined)
    : undefined
  const animateTransitions = activeDescriptor?.options.animation !== "none"

  useEffect(() => {
    for (const route of state.routes) {
      const descriptor = descriptors[route.key] as StackDescriptor | undefined
      if (descriptor) {
        warnIgnoredOptions(
          "createStackNavigator",
          descriptor.options,
          STACK_OPTION_KEYS,
        )
        const { animation } = descriptor.options
        // "animation" itself is in STACK_OPTION_KEYS above (it IS honored,
        // collapsed to a boolean), so the call above never flags it. A
        // specific requested type — anything but "none" (handled) or
        // "default" (not a specific request) — is a separate, narrower
        // complaint, forced through the same verdict lookup and the same
        // once-per-navigator-per-key dedupe with an empty supported set.
        if (
          animation !== undefined &&
          animation !== "none" &&
          animation !== "default"
        ) {
          warnIgnoredOptions("createStackNavigator", { animation }, new Set())
        }
      }
    }
  }, [state, descriptors])

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" &&
      getActiveChrome() === "system"
    ) {
      console.warn(
        '[react-native-gtkx/navigation] the app runs with the default window chrome — pages bring their own HeaderBars, so you will see a doubled titlebar. Pass chrome: "content" to AppRegistry.runApplication.',
      )
    }
  }, [])

  // `navigation` is identity-stable across renders (react-navigation builder
  // contract) and getState() always reads the live state — no ref needed.
  const handlePopped = (tag: string): void => {
    if (navigation.getState().routes.some((route) => route.key === tag)) {
      // Still in state, so the WIDGET popped on its own: follow in state.
      navigation.dispatch(StackActions.pop())
    }
    // Otherwise state dropped the route first and the primitive is merely
    // reporting the animation we asked for. Nothing to do.
  }

  // transitionStart/transitionEnd: translates NavigationStack's primitive
  // callbacks into react-navigation's own per-route events, matching
  // @react-navigation/stack and @react-navigation/native-stack's v8
  // behavior byte for byte (verified against their source, not docs — see
  // 007.md): a route that just became visible fires `closing: false`, a
  // route that just left the visible stack fires `closing: true`, and a
  // route whose visibility did not change (e.g. covered by a push) gets
  // neither event.
  //
  // The start and end sides deliberately use TWO DIFFERENT primitive
  // signals, not the same onTransitionStart/onTransitionEnd pair for both:
  //
  // - transitionStart (both directions) rides onTransitionStart, a
  //   view-level "a transition just began" signal with no per-route
  //   identity — the adapter supplies that identity itself by diffing
  //   visibleKeys against the previous render's visible keys.
  // - transitionEnd for an OPENING route also rides the view-level
  //   onTransitionEnd, itself driven by the pushed page's own real "shown"
  //   signal (transitionDuration only as a fallback — see docs/api.md and
  //   the primitive's beginTransition): the pushed screen stays mounted
  //   indefinitely once it is the active page, so nothing about that is
  //   unsafe here either way.
  // - transitionEnd for a CLOSING route rides onPageClosed instead, fired
  //   PER TAG when that page's exit actually finishes (a real GTK
  //   "hidden" signal when available, the primitive's own timer as
  //   fallback). This was not a style choice: routing the closing side
  //   through the generic view-level timer was tried first and is wrong
  //   whenever the real close finishes before the fixed transitionDuration
  //   default (guaranteed in headless test environments with animations
  //   disabled, and possible on a real desktop too) — the closing screen's
  //   React component has already unmounted (and unsubscribed its
  //   listeners) by the time the generic, one-size-fits-all timer gets
  //   around to firing, so the event never reaches anyone. onPageClosed
  //   fires synchronously before React commits that unmount, so the
  //   listener is still there to receive it.
  //
  // previousVisibleKeysRef is compared by CONTENT, not a call-count flag:
  // NavigationStack's sync effect can call beginTransition() (hence
  // onTransitionStart) more than once for one state update — e.g. popping
  // back past two routes and pushing two new ones in the same dispatch
  // calls it three times — and every one of those calls closes over the
  // SAME visibleKeys for this render. Diffing against the ref and only
  // then updating it makes every call after the first a no-op (the ref
  // already equals visibleKeys), without a manual "already handling a
  // transition" flag that would also incorrectly swallow a second,
  // genuinely separate transition starting before the first one settles.
  const previousVisibleKeysRef = useRef<string[]>(visibleKeys)
  const pendingOpeningEndRef = useRef<string[]>([])
  // Tags this adapter itself put in flight via transitionStart(closing:
  // true) — NOT every tag onPageClosed ever reports. A native pop (back
  // button, Escape, back gesture) also eventually drops its tag through
  // the exact same primitive mechanism, but never called beginTransition()
  // (see the primitive: a native pop's own handlePopped reconciles
  // syncedRef directly, so the sync effect finds nothing left to push or
  // pop once react-navigation's state catches up) — so it never got a
  // transitionStart either. Without this guard, handlePageClosed would
  // emit a transitionEnd with no matching transitionStart for every native
  // pop, which is worse than emitting neither: a listener would see an
  // end event out of nowhere. Documented as Known limitation #2 in 007.md
  // — native pops fire neither event today.
  const pendingClosingRef = useRef<Set<string>>(new Set())

  const emitTransitionEvent = (
    type: "transitionStart" | "transitionEnd",
    keys: readonly string[],
    closing: boolean,
  ): void => {
    for (const key of keys) {
      navigation.emit({ type, data: { closing }, target: key })
    }
  }

  const handleTransitionStart = (): void => {
    const previous = previousVisibleKeysRef.current
    if (
      previous.length === visibleKeys.length &&
      previous.every((key, index) => key === visibleKeys[index])
    ) {
      // A duplicate beginTransition() call for the same commit (see
      // above) — already diffed by an earlier call this render.
      return
    }
    const opening = visibleKeys.filter((key) => !previous.includes(key))
    const closing = previous.filter((key) => !visibleKeys.includes(key))
    previousVisibleKeysRef.current = visibleKeys
    pendingOpeningEndRef.current.push(...opening)
    for (const key of closing) {
      pendingClosingRef.current.add(key)
    }
    emitTransitionEvent("transitionStart", opening, false)
    emitTransitionEvent("transitionStart", closing, true)
  }

  // Drains whatever opening keys are pending rather than trusting call
  // count, for the same reason handleTransitionStart diffs by content: a
  // compound update's several onTransitionEnd calls (one per
  // beginTransition() above) all land at essentially the same moment, so
  // the first one emits everything queued and the rest find nothing left
  // to drain. Closing keys are NOT handled here — see handlePageClosed.
  const handleTransitionEnd = (): void => {
    const opening = pendingOpeningEndRef.current
    if (opening.length === 0) {
      return
    }
    pendingOpeningEndRef.current = []
    emitTransitionEvent("transitionEnd", opening, false)
  }

  const handlePageClosed = (tag: string): void => {
    if (!pendingClosingRef.current.has(tag)) {
      // Not a tag this adapter put in flight (a native pop, or a stray
      // call) — no transitionStart was ever emitted for it, so no
      // transitionEnd either.
      return
    }
    pendingClosingRef.current.delete(tag)
    navigation.emit({
      type: "transitionEnd",
      data: { closing: true },
      target: tag,
    })
  }

  return (
    <NavigationContent>
      <StackView
        routeKeys={visibleKeys}
        descriptors={descriptors}
        animateTransitions={animateTransitions}
        onPopped={handlePopped}
        onTransitionStart={handleTransitionStart}
        onTransitionEnd={handleTransitionEnd}
        onPageClosed={handlePageClosed}
      />
    </NavigationContent>
  )
}

type StackViewProps = {
  routeKeys: string[]
  descriptors: Record<string, unknown>
  animateTransitions: boolean
  onPopped: (tag: string) => void
  onTransitionStart: () => void
  onTransitionEnd: () => void
  onPageClosed: (tag: string) => void
}

// The page list lives inside NavigationContent so it can read the
// prevent-remove context (which useNavigationBuilder only provides to
// NavigationContent's children). A page whose route is prevented — or whose
// screen set gestureEnabled: false — reports canPop: false, so Adwaita
// disables the back button, Escape and the back gesture for it; a
// programmatic goBack still pops (once the app lifts the prevention, e.g.
// after its own confirmation dialog). This is why a native pop can never
// race react-navigation state for these routes.
const StackView = ({
  routeKeys,
  descriptors,
  animateTransitions,
  onPopped,
  onTransitionStart,
  onTransitionEnd,
  onPageClosed,
}: StackViewProps) => {
  const { preventedRoutes } = usePreventRemoveContext()
  return (
    <NavigationStack
      stack={routeKeys}
      animateTransitions={animateTransitions}
      onPopped={onPopped}
      onTransitionStart={onTransitionStart}
      onTransitionEnd={onTransitionEnd}
      onPageClosed={onPageClosed}
    >
      {routeKeys.map((key) => {
        const descriptor = descriptors[key] as StackDescriptor | undefined
        if (!descriptor) {
          return null
        }
        const options = descriptor.options
        const headerShown = options.headerShown ?? true
        const canPop =
          options.gestureEnabled !== false &&
          !preventedRoutes[key]?.preventRemove
        const content = <SlotContent>{descriptor.render()}</SlotContent>
        return (
          <NavigationStackPage
            key={key}
            tag={key}
            // Never the route key — that is an internal identifier, and it
            // would end up in the window title under content chrome.
            title={options.title ?? descriptor.route.name}
            canPop={canPop}
          >
            {headerShown ? (
              <AdwToolbarView
                topBar={
                  <AdwHeaderBar
                    start={
                      options.headerLeft ? (
                        <IntrinsicContent>
                          {options.headerLeft()}
                        </IntrinsicContent>
                      ) : undefined
                    }
                    end={[
                      ...(options.headerRight
                        ? [
                            <IntrinsicContent key="header-right">
                              {options.headerRight()}
                            </IntrinsicContent>,
                          ]
                        : []),
                      ...(options.headerButtons?.map((button) => (
                        <GtkButton
                          key={button.id}
                          iconName={button.icon}
                          tooltipText={button.tooltip}
                          onClicked={button.onPress}
                        />
                      )) ?? []),
                    ]}
                  />
                }
              >
                {content}
              </AdwToolbarView>
            ) : (
              content
            )}
          </NavigationStackPage>
        )
      })}
    </NavigationStack>
  )
}

export {
  createSidebarNavigator,
  type HeaderButton,
  type SidebarNavigationOptions,
  type SidebarScreenConfig,
  type SidebarScreenProps,
  type TypedSidebarNavigator,
} from "./sidebar"

// BREAKING CHANGE: this file used to re-export CommonActions,
// NavigationContainer, StackActions, useFocusEffect, useIsFocused,
// useNavigation, useNavigationContainerRef, usePreventRemove and useRoute
// from @react-navigation/native, so an app could import the whole surface
// from one place. Removed: the set was never complete (apps still had to
// go to @react-navigation/native directly for anything else — dispatch
// helpers, linking types, the rest of the hooks), so re-exporting a subset
// was only a second place to look, not a convenience. Import these names
// from @react-navigation/native directly; this package exports only what
// is genuinely its own (createStackNavigator, createSidebarNavigator, and
// the option/prop types around them).

// ---- typed factory --------------------------------------------------------
// React Navigation 8 ships a genuinely generic createNavigatorFactory
// (NavigatorTypeBagBase + createNavigatorFactory<TypeBag>) — the manual
// `stackFactory() as TypedStackNavigator<ParamList>` cast this file used to
// need (upstream's factory returned `any`) is gone. The type bag below
// wires our own state/options/navigator shape into their factory, so
// Stack.Navigator and Stack.Screen come out correctly typed — including
// catching a typo'd screen name or a mismatched param type at the JSX call
// site, which the old cast could not. Runtime is unchanged either way:
// createNavigatorFactory(Navigator) has always just returned
// `{ Navigator, Screen, Group }` (Screen/Group are no-op marker
// components); only the TYPES improved.

export type StackNavigationHelpers<
  ParamList extends ParamListBase = ParamListBase,
  RouteName extends keyof ParamList = keyof ParamList,
> = NavigationProp<
  ParamList,
  RouteName,
  StackNavigationState<ParamList>,
  StackNavigationOptions,
  StackNavigationEventMap
>

export type StackScreenProps<
  ParamList extends ParamListBase = ParamListBase,
  RouteName extends keyof ParamList = keyof ParamList,
> = {
  route: RouteProp<ParamList, RouteName>
  navigation: StackNavigationHelpers<ParamList, RouteName>
}

export type StackScreenConfig<
  ParamList extends ParamListBase,
  RouteName extends keyof ParamList,
> = {
  name: RouteName
  component: ComponentType<StackScreenProps<ParamList, RouteName>>
  options?:
    | StackNavigationOptions
    | ((
        props: StackScreenProps<ParamList, RouteName>,
      ) => StackNavigationOptions)
  initialParams?: Partial<ParamList[RouteName]>
}

interface StackTypeBag extends NavigatorTypeBagBase {
  ParamList: ParamListBase
  State: StackNavigationState<ParamListBase>
  ScreenOptions: StackNavigationOptions
  EventMap: StackNavigationEventMap
  ActionHelpers: Record<string, () => void>
  Navigator: typeof StackNavigator
}

const stackFactory = createNavigatorFactory<StackTypeBag>(StackNavigator)

// The explicit return type is built from TypedNavigator + NavigatorTypeBagFor
// (both public exports) rather than `ReturnType<typeof stackFactory<ParamList>>`
// for two reasons found empirically:
// - `TypedNavigatorFactory` has two overloaded call signatures (dynamic
//   Navigator/Screen vs. static config). Resolving
//   `typeof stackFactory<ParamList>` as a bare instantiation expression
//   (as opposed to an actual call) picks the wrong one — the static-config
//   overload — even though calling `stackFactory<ParamList>()` for real
//   resolves correctly.
// - Declaration emit (`tsc -p tsconfig.build.json`, i.e. `build:dist`)
//   additionally rejects an inferred-only return type here with
//   TS2742 ("cannot be named without a reference to .../utilities"),
//   because it transitively touches a type `@react-navigation/core`
//   does not export from its public entry point. Naming the return type
//   through the two types this package DOES export sidesteps both.
export type TypedStackNavigator<ParamList extends ParamListBase> =
  TypedNavigator<NavigatorTypeBagFor<StackTypeBag, ParamList>, undefined>

export const createStackNavigator = <
  ParamList extends ParamListBase = ParamListBase,
>(): TypedStackNavigator<ParamList> => stackFactory<ParamList>()
