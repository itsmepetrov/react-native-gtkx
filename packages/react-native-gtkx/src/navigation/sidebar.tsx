// createSidebarNavigator — the desktop equivalent of a drawer navigator on
// Adw.NavigationSplitView: a persistent native sidebar (GtkListBox with the
// Adwaita navigation-sidebar styling) selects between parallel screens.
// TabRouter fits these semantics (one focused screen out of a set, no
// stack); the name follows the desktop mental model rather than "drawer" —
// nothing slides over content on this platform.
//
// Selection sync mirrors the stack navigator's protocol: the native
// row-selected signal dispatches jumpTo only when it disagrees with state,
// and an effect re-selects the row when state changes programmatically —
// the guard on both sides breaks the echo loop.
import {
  createNavigatorFactory,
  TabActions,
  TabRouter,
  useNavigationBuilder,
  type NavigationProp,
  type NavigatorTypeBagBase,
  type NavigatorTypeBagFor,
  type ParamListBase,
  type RouteProp,
  type TabNavigationState,
  type TypedNavigator,
} from "@react-navigation/native"
import { useEffect, useRef, type ComponentType, type ReactNode } from "react"
import { getActiveChrome } from "../components/app-registry"
// Widgets come from the public subpaths, the same ones an app would use —
// the adapter has no privileged access to gtkx.
import {
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationSplitView,
  AdwToolbarView,
} from "../adw"
import { SlotContent } from "../common"
import {
  Gtk,
  GtkButton,
  GtkLabel,
  GtkListBox,
  GtkListBoxRow,
  GtkScrolledWindow,
} from "../gtk"
import { warnIgnoredOptions } from "./option-warnings"

const SIDEBAR_OPTION_KEYS: ReadonlySet<string> = new Set(["title"])

export type SidebarNavigationOptions = {
  /** Sidebar row and content AdwHeaderBar title; defaults to the route name. */
  title?: string
}

// A declarative AdwHeaderBar button: the RN-facing API stays GTK-free — the
// navigator renders the native button itself. `icon` is an Adwaita symbolic
// icon name (e.g. "weather-clear-night-symbolic").
export type HeaderButton = {
  id: string
  icon: string
  tooltip?: string
  onPress: () => void
}

type SidebarDescriptor = {
  options: SidebarNavigationOptions
  render: () => ReactNode
}

type SidebarNavigatorProps = {
  initialRouteName?: string
  screenOptions?: SidebarNavigationOptions
  /** Title of the sidebar pane's AdwHeaderBar. */
  sidebarTitle?: string
  /** Buttons packed at the end of the content AdwHeaderBar. */
  headerButtons?: HeaderButton[]
  children: ReactNode
}

const SidebarNavigator = ({
  initialRouteName,
  screenOptions,
  sidebarTitle = "Sidebar",
  headerButtons,
  children,
}: SidebarNavigatorProps) => {
  const { state, descriptors, navigation, NavigationContent } =
    useNavigationBuilder<
      TabNavigationState<ParamListBase>,
      Record<string, unknown>,
      Record<string, () => void>,
      SidebarNavigationOptions,
      Record<string, unknown>
    >(TabRouter, {
      initialRouteName,
      screenOptions,
      children,
    })

  const listRef = useRef<Gtk.ListBox | null>(null)

  useEffect(() => {
    for (const route of state.routes) {
      const descriptor = descriptors[route.key] as SidebarDescriptor | undefined
      if (descriptor) {
        warnIgnoredOptions(
          "createSidebarNavigator",
          descriptor.options,
          SIDEBAR_OPTION_KEYS,
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
        '[react-native-gtkx/navigation] the app runs with the default window chrome — the split view brings its own HeaderBars, so you will see a doubled titlebar. Pass chrome: "content" to AppRegistry.runApplication.',
      )
    }
  }, [])

  // State → native selection (initial mount and programmatic navigation).
  useEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }
    const row = list.getRowAtIndex(state.index)
    if (row && list.getSelectedRow() !== row) {
      list.selectRow(row)
    }
  }, [state.index])

  // Unlike the stack navigator (see src/navigation/index.tsx), `state.routes`
  // here does NOT need slicing for React Navigation 8's preloaded-routes
  // change: TabRouter sits on SwitchRouter, whose `getInitialState` puts
  // every declared screen name into `routes` unconditionally, from the very
  // first render — that's how switch/tab-style routers have always worked,
  // v7 and v8 alike, since they show one of N statically known screens
  // rather than a dynamically growing stack. `preloadedRouteKeys` in v8 is
  // bookkeeping over those already-present routes (which of them have been
  // pre-warmed via `navigation.preload()`); it does not add entries to
  // `state.routes` that weren't already there. Rendering every route as a
  // sidebar row (below) is correct both before and after v8 — confirmed by
  // reading node_modules/@react-navigation/routers' SwitchRouter source,
  // see updates/001/progress.md.
  const active = state.routes[state.index]!
  const activeDescriptor = descriptors[active.key] as
    SidebarDescriptor | undefined
  const titleOf = (routeKey: string, fallback: string): string =>
    (descriptors[routeKey] as SidebarDescriptor | undefined)?.options.title ??
    fallback

  return (
    <NavigationContent>
      <AdwNavigationSplitView
        sidebar={
          <AdwNavigationPage
            title={sidebarTitle}
            tag="sidebar"
          >
            <AdwToolbarView topBar={<AdwHeaderBar />}>
              {/* The list must not dictate the window minimum: the sidebar
                  scrolls when the window is shorter than its rows — the
                  Adwaita sidebar pattern (and RN semantics: scrolling is
                  explicit, never the window's). */}
              <GtkScrolledWindow
                hscrollbarPolicy={Gtk.PolicyType.NEVER}
                propagateNaturalWidth
              >
                <GtkListBox
                  ref={listRef}
                  cssClasses={["navigation-sidebar"]}
                  onRowSelected={(row) => {
                    if (!row) {
                      return
                    }
                    const route = state.routes[row.getIndex()]
                    if (route && route.key !== active.key) {
                      navigation.dispatch({
                        ...TabActions.jumpTo(route.name),
                        target: state.key,
                      })
                    }
                  }}
                >
                  {state.routes.map((route) => (
                    <GtkListBoxRow key={route.key}>
                      <GtkLabel
                        label={titleOf(route.key, route.name)}
                        xalign={0}
                        marginTop={8}
                        marginBottom={8}
                        marginStart={6}
                        marginEnd={6}
                      />
                    </GtkListBoxRow>
                  ))}
                </GtkListBox>
              </GtkScrolledWindow>
            </AdwToolbarView>
          </AdwNavigationPage>
        }
      >
        <AdwNavigationPage
          title={titleOf(active.key, active.name)}
          tag="content"
        >
          <AdwToolbarView
            topBar={
              <AdwHeaderBar
                end={headerButtons?.map((button) => (
                  <GtkButton
                    key={button.id}
                    iconName={button.icon}
                    tooltipText={button.tooltip}
                    onClicked={button.onPress}
                  />
                ))}
              />
            }
          >
            {/* Keyed by route: switching sections swaps the whole screen —
                a fresh SlotContent per section, the previous one disposes. */}
            <SlotContent key={active.key}>
              {activeDescriptor?.render()}
            </SlotContent>
          </AdwToolbarView>
        </AdwNavigationPage>
      </AdwNavigationSplitView>
    </NavigationContent>
  )
}

export type SidebarScreenProps<
  ParamList extends ParamListBase = ParamListBase,
  RouteName extends keyof ParamList = keyof ParamList,
> = {
  route: RouteProp<ParamList, RouteName>
  navigation: NavigationProp<
    ParamList,
    RouteName,
    TabNavigationState<ParamList>,
    SidebarNavigationOptions
  >
}

export type SidebarScreenConfig<
  ParamList extends ParamListBase,
  RouteName extends keyof ParamList,
> = {
  name: RouteName
  component: ComponentType<SidebarScreenProps<ParamList, RouteName>>
  options?: SidebarNavigationOptions
  initialParams?: Partial<ParamList[RouteName]>
}

// See src/navigation/index.tsx's "typed factory" comment for why this
// replaces a manual cast: createNavigatorFactory is genuinely generic in
// React Navigation 8, runtime is unchanged.
interface SidebarTypeBag extends NavigatorTypeBagBase {
  ParamList: ParamListBase
  State: TabNavigationState<ParamListBase>
  ScreenOptions: SidebarNavigationOptions
  EventMap: Record<string, unknown>
  ActionHelpers: Record<string, () => void>
  Navigator: typeof SidebarNavigator
}

const sidebarFactory = createNavigatorFactory<SidebarTypeBag>(SidebarNavigator)

// See src/navigation/index.tsx's createStackNavigator for why the return
// type is spelled out via TypedNavigator + NavigatorTypeBagFor rather than
// `ReturnType<typeof sidebarFactory<ParamList>>`.
export type TypedSidebarNavigator<ParamList extends ParamListBase> =
  TypedNavigator<NavigatorTypeBagFor<SidebarTypeBag, ParamList>, undefined>

export const createSidebarNavigator = <
  ParamList extends ParamListBase = ParamListBase,
>(): TypedSidebarNavigator<ParamList> => sidebarFactory<ParamList>()
