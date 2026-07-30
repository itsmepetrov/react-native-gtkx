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
  type ParamListBase,
  type TabNavigationState,
} from "@react-navigation/native"
import { useEffect, useRef, type ReactNode } from "react"
import { getActiveChrome } from "../components/app-registry"
import { NestedRoot } from "../components/root"
import {
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationSplitView,
  AdwToolbarView,
  Gtk,
  GtkButton,
  GtkLabel,
  GtkListBox,
  GtkListBoxRow,
  GtkScrolledWindow,
} from "../gtkx/bridge/index"
import { warnIgnoredOptions } from "./option-warnings"

const SIDEBAR_OPTION_KEYS: ReadonlySet<string> = new Set(["title"])

export type SidebarNavigationOptions = {
  /** Sidebar row and content HeaderBar title; defaults to the route name. */
  title?: string
}

// A declarative HeaderBar button: the RN-facing API stays GTK-free — the
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
  /** Title of the sidebar pane's HeaderBar. */
  sidebarTitle?: string
  /** Buttons packed at the end of the content HeaderBar. */
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
                a fresh NestedRoot per section, the previous one disposes. */}
            <NestedRoot key={active.key}>
              {activeDescriptor?.render()}
            </NestedRoot>
          </AdwToolbarView>
        </AdwNavigationPage>
      </AdwNavigationSplitView>
    </NavigationContent>
  )
}

export const createSidebarNavigator = createNavigatorFactory(SidebarNavigator)
