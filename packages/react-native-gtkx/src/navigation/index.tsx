// react-native-gtkx/navigation — a react-navigation stack navigator backed
// by Adw.NavigationView. The model mirrors @react-navigation/native-stack
// on iOS (UINavigationController): react-navigation state is the source of
// truth, the native view is imperatively synced to it, and NATIVE pops (the
// Adwaita back button, Escape, the back gesture) are reported back through
// the "popped" signal.
//
// Sync protocol (the two directions must not echo each other):
// - state → view: an effect diffs the synced tag stack against
//   state.routes and drives pushByTag / popToTag / replaceWithTags. Pages
//   are declarative children keyed by route.key, so the widgets exist
//   before the effect runs.
// - view → state: "popped" fires for EVERY popped page, ours and the
//   user's. The discriminator is the state itself: a tag that is still in
//   state.routes means the user popped the view (dispatch POP); a tag
//   already gone from state means the pop was state-driven — ignore.
import {
  createNavigatorFactory,
  StackActions,
  StackRouter,
  useNavigationBuilder,
  type NavigationProp,
  type ParamListBase,
  type RouteProp,
  type StackNavigationState,
} from "@react-navigation/native"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import { InteractionManager } from "../apis/interaction-manager"
import { getActiveChrome } from "../components/app-registry"
import { IntrinsicRoot, NestedRoot } from "../components/root"
import {
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationView,
  AdwToolbarView,
  GtkButton,
  type Adw,
} from "../gtkx/bridge/index"
import { warnIgnoredOptions } from "./option-warnings"
import type { HeaderButton } from "./sidebar"

const STACK_OPTION_KEYS: ReadonlySet<string> = new Set([
  "title",
  "headerShown",
  "headerButtons",
  "headerLeft",
  "headerRight",
])

export type StackNavigationOptions = {
  /** HeaderBar title; defaults to the route name. */
  title?: string
  /** Render the Adwaita HeaderBar for this screen (default true). */
  headerShown?: boolean
  /** Buttons packed at the end of this screen's HeaderBar (see
   *  HeaderButton); screens usually set them via navigation.setOptions. */
  headerButtons?: HeaderButton[]
  /** RN content packed at the start of the HeaderBar (an intrinsic-size
   *  layout root: the content's Yoga size IS the slot size). */
  headerLeft?: () => ReactNode
  /** RN content packed at the end of the HeaderBar, before headerButtons. */
  headerRight?: () => ReactNode
}

type StackDescriptor = {
  options: StackNavigationOptions
  render: () => ReactNode
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
      Record<string, unknown>
    >(StackRouter, {
      initialRouteName,
      screenOptions,
      children,
    })

  const viewRef = useRef<Adw.NavigationView | null>(null)

  useEffect(() => {
    for (const route of state.routes) {
      const descriptor = descriptors[route.key] as StackDescriptor | undefined
      if (descriptor) {
        warnIgnoredOptions(
          "createStackNavigator",
          descriptor.options,
          STACK_OPTION_KEYS,
        )
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
  // Mirror of the view's visible stack (route keys), maintained by the sync
  // effect and by the popped handler — the two never race: GTK signals run
  // synchronously inside the very push/pop calls the effect makes.
  const syncedRef = useRef<string[]>([])

  // Pop ANIMATION support: react-navigation drops a popped route from state
  // immediately, but Adwaita still animates the page out (~200 ms). Pages
  // therefore render from renderedKeys — live routes plus closing pages —
  // and a closing page leaves only on its "hidden" signal (the end of the
  // transition). Its content renders from a snapshot cached while live.
  const [renderedKeys, setRenderedKeys] = useState<string[]>(() =>
    state.routes.map((route) => route.key),
  )
  const liveKeys = state.routes.map((route) => route.key)
  const missingKeys = liveKeys.filter((key) => !renderedKeys.includes(key))
  if (missingKeys.length > 0) {
    // The sanctioned derive-state-during-render pattern: a new route must be
    // in renderedKeys within the same commit its page is pushed.
    setRenderedKeys([...renderedKeys, ...missingKeys])
  }
  // A state-held stable Map (not a ref): the render path reads it for
  // closing pages, and the react-hooks/refs rule rightly bans render-time
  // ref reads.
  const [snapshots] = useState(
    () =>
      new Map<
        string,
        { name: string; options: StackNavigationOptions; element: ReactNode }
      >(),
  )
  useEffect(() => {
    for (const route of state.routes) {
      const descriptor = descriptors[route.key] as StackDescriptor | undefined
      if (descriptor) {
        snapshots.set(route.key, {
          name: route.name,
          options: descriptor.options,
          element: <NestedRoot>{descriptor.render()}</NestedRoot>,
        })
      }
    }
  })

  const handleHidden = useCallback(
    (key: string): void => {
      // "hidden" also fires for a live page covered by a push — only pages
      // gone from state are actually closing.
      if (navigation.getState().routes.some((route) => route.key === key)) {
        return
      }
      snapshots.delete(key)
      setRenderedKeys((keys) => keys.filter((rendered) => rendered !== key))
    },
    [navigation, snapshots],
  )

  // "hidden" delivery is not guaranteed in every environment (headless
  // compositors with animations disabled never emit it) — a timer slightly
  // longer than the Adwaita transition is the fallback; handleHidden is
  // idempotent, whichever fires first wins.
  const scheduleRetainedRemoval = useCallback(
    (key: string): void => {
      setTimeout(() => handleHidden(key), 400)
    },
    [handleHidden],
  )

  // Bracket every view transition with an InteractionManager handle so
  // runAfterInteractions-scheduled work (a screen's own data load / heavy
  // render) waits for the slide to finish instead of stealing its frames.
  // The handle is opened when the sync effect mutates the view and cleared
  // one transition-length later; overlapping transitions reference-count.
  const beginTransition = useCallback((): void => {
    const handle = InteractionManager.createInteractionHandle()
    setTimeout(() => InteractionManager.clearInteractionHandle(handle), 400)
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }
    const target = state.routes.map((route) => route.key)
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
      // The stack root changed (reset): swap the whole visible stack.
      const leaving = syncedRef.current.filter((key) => !target.includes(key))
      syncedRef.current = [...target]
      beginTransition()
      view.replaceWithTags(target)
      for (const key of leaving) {
        scheduleRetainedRemoval(key)
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
      for (const key of leaving) {
        scheduleRetainedRemoval(key)
      }
    }
    for (
      let index = syncedRef.current.length;
      index < target.length;
      index += 1
    ) {
      const key = target[index]!
      syncedRef.current.push(key)
      beginTransition()
      view.pushByTag(key)
    }
  }, [state, scheduleRetainedRemoval, beginTransition])

  // `navigation` is identity-stable across renders (react-navigation
  // builder contract) and getState() always reads the live state — the
  // closure needs no ref indirection.
  const handlePopped = (page: Adw.NavigationPage | null): void => {
    const tag = page?.getTag()
    if (!tag) {
      return
    }
    syncedRef.current = syncedRef.current.filter((key) => key !== tag)
    const current = navigation.getState()
    if (current.routes.some((route) => route.key === tag)) {
      // The view popped on its own (back button / gesture): follow in state.
      navigation.dispatch(StackActions.pop())
    }
    scheduleRetainedRemoval(tag)
  }

  return (
    <NavigationContent>
      <AdwNavigationView
        ref={viewRef}
        onPopped={(page) => handlePopped(page)}
      >
        {renderedKeys.map((key) => {
          const route = state.routes.find((candidate) => candidate.key === key)
          const descriptor = route
            ? (descriptors[key] as StackDescriptor | undefined)
            : undefined
          const snapshot = snapshots.get(key)
          const options = descriptor?.options ?? snapshot?.options ?? {}
          const headerShown = options.headerShown ?? true
          const content = descriptor ? (
            <NestedRoot>{descriptor.render()}</NestedRoot>
          ) : (
            (snapshot?.element ?? null)
          )
          return (
            <AdwNavigationPage
              key={key}
              tag={key}
              title={options.title ?? route?.name ?? snapshot?.name ?? key}
              onHidden={() => handleHidden(key)}
            >
              {headerShown ? (
                <AdwToolbarView
                  topBar={
                    <AdwHeaderBar
                      start={
                        options.headerLeft ? (
                          <IntrinsicRoot>{options.headerLeft()}</IntrinsicRoot>
                        ) : undefined
                      }
                      end={[
                        ...(options.headerRight
                          ? [
                              <IntrinsicRoot key="header-right">
                                {options.headerRight()}
                              </IntrinsicRoot>,
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
            </AdwNavigationPage>
          )
        })}
      </AdwNavigationView>
    </NavigationContent>
  )
}

// ---- typed factory --------------------------------------------------------
// The upstream createNavigatorFactory returns `any` — mirroring the typed
// wrapper pattern of native-stack gives Screen configs, options and screen
// props real types without changing runtime behavior.

export type StackNavigationHelpers<
  ParamList extends ParamListBase = ParamListBase,
  RouteName extends keyof ParamList = keyof ParamList,
> = NavigationProp<
  ParamList,
  RouteName,
  undefined,
  StackNavigationState<ParamList>,
  StackNavigationOptions
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

export type TypedStackNavigator<ParamList extends ParamListBase> = {
  Navigator: ComponentType<StackNavigatorProps>
  Screen: <RouteName extends keyof ParamList>(
    props: StackScreenConfig<ParamList, RouteName>,
  ) => null
}

const stackFactory = createNavigatorFactory(StackNavigator)

export const createStackNavigator = <
  ParamList extends ParamListBase = ParamListBase,
>(): TypedStackNavigator<ParamList> =>
  stackFactory() as TypedStackNavigator<ParamList>

export {
  createSidebarNavigator,
  type HeaderButton,
  type SidebarNavigationOptions,
  type SidebarScreenConfig,
  type SidebarScreenProps,
  type TypedSidebarNavigator,
} from "./sidebar"

// The rest of the react-navigation surface apps need, so a linux app can
// import everything from one place.
export {
  CommonActions,
  NavigationContainer,
  StackActions,
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useNavigationContainerRef,
  useRoute,
} from "@react-navigation/native"
