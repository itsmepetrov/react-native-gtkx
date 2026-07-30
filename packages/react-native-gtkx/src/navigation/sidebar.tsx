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
import { NestedRoot } from "../components/root"
import {
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationSplitView,
  AdwToolbarView,
  GtkLabel,
  GtkListBox,
  GtkListBoxRow,
  type Gtk,
} from "../gtkx/bridge/index"

export type SidebarNavigationOptions = {
  /** Sidebar row and content HeaderBar title; defaults to the route name. */
  title?: string
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
  children: ReactNode
}

const SidebarNavigator = ({
  initialRouteName,
  screenOptions,
  sidebarTitle = "Sidebar",
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
            </AdwToolbarView>
          </AdwNavigationPage>
        }
      >
        <AdwNavigationPage
          title={titleOf(active.key, active.name)}
          tag="content"
        >
          <AdwToolbarView topBar={<AdwHeaderBar />}>
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
