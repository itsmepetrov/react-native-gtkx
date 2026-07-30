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
  type ParamListBase,
  type StackNavigationState,
} from "@react-navigation/native"
import { useEffect, useRef, type ReactNode } from "react"
import { NestedRoot } from "../components/root"
import {
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationView,
  AdwToolbarView,
  type Adw,
} from "../gtkx/bridge/index"

export type StackNavigationOptions = {
  /** HeaderBar title; defaults to the route name. */
  title?: string
  /** Render the Adwaita HeaderBar for this screen (default true). */
  headerShown?: boolean
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
  // Mirror of the view's visible stack (route keys), maintained by the sync
  // effect and by the popped handler — the two never race: GTK signals run
  // synchronously inside the very push/pop calls the effect makes.
  const syncedRef = useRef<string[]>([])

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
      syncedRef.current = [...target]
      view.replaceWithTags(target)
      return
    }
    if (syncedRef.current.length > common) {
      const anchor = target[common - 1]
      syncedRef.current = syncedRef.current.slice(0, common)
      if (anchor !== undefined) {
        view.popToTag(anchor)
      }
    }
    for (
      let index = syncedRef.current.length;
      index < target.length;
      index += 1
    ) {
      const key = target[index]!
      syncedRef.current.push(key)
      view.pushByTag(key)
    }
  }, [state])

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
  }

  return (
    <NavigationContent>
      <AdwNavigationView
        ref={viewRef}
        onPopped={(page) => handlePopped(page)}
      >
        {state.routes.map((route) => {
          const descriptor = descriptors[route.key] as
            StackDescriptor | undefined
          const options = descriptor?.options ?? {}
          const headerShown = options.headerShown ?? true
          const content = <NestedRoot>{descriptor?.render()}</NestedRoot>
          return (
            <AdwNavigationPage
              key={route.key}
              tag={route.key}
              title={options.title ?? route.name}
            >
              {headerShown ? (
                <AdwToolbarView topBar={<AdwHeaderBar />}>
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

export const createStackNavigator = createNavigatorFactory(StackNavigator)

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
