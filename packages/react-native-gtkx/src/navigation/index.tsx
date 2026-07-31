// react-native-gtkx/navigation — a react-navigation stack navigator backed
// by the Adw.NavigationView primitive from react-native-gtkx/adwaita.
//
// This file is an ADAPTER and nothing else. Every widget concern — diffing
// the tag stack into pushes and pops, holding a popped page alive until its
// exit animation ends, bracketing transitions — lives in the primitive. What
// stays here is exactly the react-navigation half:
//
// - state → the ordered tags handed to AdwNavigationView (route keys);
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
  type ParamListBase,
  type RouteProp,
  type StackNavigationState,
} from "@react-navigation/native"
import { useEffect, type ComponentType, type ReactNode } from "react"
import { getActiveChrome } from "../components/app-registry"
import {
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationView,
  AdwToolbarView,
  IntrinsicContent,
  PageContent,
} from "../adwaita"
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
      Record<string, unknown>
    >(StackRouter, {
      initialRouteName,
      screenOptions,
      children,
    })

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

  return (
    <NavigationContent>
      <StackView
        routeKeys={state.routes.map((route) => route.key)}
        descriptors={descriptors}
        onPopped={handlePopped}
      />
    </NavigationContent>
  )
}

type StackViewProps = {
  routeKeys: string[]
  descriptors: Record<string, unknown>
  onPopped: (tag: string) => void
}

// The page list lives inside NavigationContent so it can read the
// prevent-remove context (which useNavigationBuilder only provides to
// NavigationContent's children). A page whose route is prevented — or whose
// screen set gestureEnabled: false — reports canPop: false, so Adwaita
// disables the back button, Escape and the back gesture for it; a
// programmatic goBack still pops (once the app lifts the prevention, e.g.
// after its own confirmation dialog). This is why a native pop can never
// race react-navigation state for these routes.
const StackView = ({ routeKeys, descriptors, onPopped }: StackViewProps) => {
  const { preventedRoutes } = usePreventRemoveContext()
  return (
    <AdwNavigationView
      stack={routeKeys}
      onPopped={onPopped}
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
        const content = <PageContent>{descriptor.render()}</PageContent>
        return (
          <AdwNavigationPage
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
          </AdwNavigationPage>
        )
      })}
    </AdwNavigationView>
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
  usePreventRemove,
  useRoute,
} from "@react-navigation/native"

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
