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
  Adw,
  AdwActionRow,
  AdwBreakpoint,
  AdwBreakpointBin,
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationSplitView,
  AdwToolbarView,
} from "../adw"
import { IntrinsicContent, SlotContent } from "../common"
import {
  css,
  GObject,
  Gtk,
  GtkBox,
  GtkButton,
  GtkImage,
  GtkLabel,
  GtkListBox,
  GtkScrolledWindow,
} from "../gtk"
import { warnIgnoredOptions } from "./option-warnings"

const SIDEBAR_OPTION_KEYS: ReadonlySet<string> = new Set([
  "title",
  "icon",
  "color",
  "count",
  "headerLeft",
  "headerRight",
  "headerTitle",
  "headerButtons",
])

export type SidebarNavigationOptions = {
  /** Sidebar row and content AdwHeaderBar title; defaults to the route name. */
  title?: string
  /** Adwaita symbolic icon name for the sidebar row's prefix (e.g.
   *  "view-list-symbolic"). Ignored when `color` is also set — a row shows
   *  a colored dot OR an icon, never both (the same rule tasks-app's own
   *  hand-rolled sidebar followed). */
  icon?: string
  /** A CSS color for a colored dot prefix, replacing `icon` on this row —
   *  the way a user-created list is told apart from a smart view. */
  color?: string
  /** Badge shown as the row's suffix. Hidden when 0 or undefined — an
   *  empty view shows no badge, not a "0". */
  count?: number
  /** RN content packed at the start of the CONTENT AdwHeaderBar (an
   *  intrinsic-size root, same contract as the stack navigator's
   *  `headerLeft`) — a back button for an in-place "item open" state, a
   *  "New" action, anything that changes with THIS screen's selection.
   *  Call `navigation.setOptions({ headerLeft: … })` from the screen to
   *  change it as its own internal state changes — no stack involved. */
  headerLeft?: () => ReactNode
  /** RN content packed at the end of the content AdwHeaderBar, before
   *  `headerButtons`. Same contract as `headerLeft`. */
  headerRight?: () => ReactNode
  /** Replaces the content AdwHeaderBar's title widget for this screen —
   *  a filter toggle group, an editable title plus a star toggle,
   *  anything a plain string `title` cannot express. Left unset, the
   *  HeaderBar shows the page's own title automatically (unchanged
   *  default behavior). */
  headerTitle?: () => ReactNode
  /** Overrides the navigator-level `headerButtons` prop for this screen
   *  specifically (replaces it entirely when set, same as the stack
   *  navigator's per-screen option override). */
  headerButtons?: HeaderButton[]
}

// A one-off CSS class for a colored dot prefix — the same mechanism
// tasks-app's own sidebar used (react-native-gtkx/gtk's `css` tag, kept
// private here since it is a rendering detail of this navigator, not a
// public primitive).
const listDot = (color: string): string => css`
  min-width: 12px;
  min-height: 12px;
  border-radius: 9999px;
  background: ${color};
`

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
  /**
   * Width (sp) below which the split view collapses to the sidebar or the
   * content pane alone, driven by a native `Adw.Breakpoint` — NOT a
   * `useWindowDimensions` check (see docs/platform-layer.md, "Two ways to
   * react to size"). The property flip happens inside GTK's own allocation
   * pass, with no React render for the resize itself. Unset by default: no
   * `AdwBreakpointBin` is mounted at all, so existing consumers
   * (`examples/gallery`) see no behavior change.
   */
  collapseWidth?: number
  children: ReactNode
}

const SidebarNavigator = ({
  initialRouteName,
  screenOptions,
  sidebarTitle = "Sidebar",
  headerButtons,
  collapseWidth,
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
  const splitViewRef = useRef<Adw.NavigationSplitView | null>(null)
  const breakpointRef = useRef<Adw.Breakpoint | null>(null)
  const collapseRegisteredRef = useRef(false)

  // Registers the native setter exactly once: Breakpoint.addSetter wants a
  // real boxed GObject.Value (a bare JS boolean fails a G_IS_VALUE
  // assertion on the native side — see docs/platform-layer.md). Once
  // registered, GTK flips AdwNavigationSplitView's `collapsed` property
  // itself at the threshold, inside its own allocation pass — no React
  // state, no re-render for the resize itself.
  useEffect(() => {
    if (collapseWidth === undefined || collapseRegisteredRef.current) {
      return
    }
    const breakpoint = breakpointRef.current
    const splitView = splitViewRef.current
    if (!breakpoint || !splitView) {
      return
    }
    const collapsed = new GObject.Value()
    collapsed.init(GObject.typeFromName("gboolean"))
    collapsed.setBoolean(true)
    breakpoint.addSetter(splitView, "collapsed", collapsed)
    collapseRegisteredRef.current = true
  }, [collapseWidth])

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
  const optionsOf = (routeKey: string): SidebarNavigationOptions =>
    (descriptors[routeKey] as SidebarDescriptor | undefined)?.options ?? {}
  const titleOf = (routeKey: string, fallback: string): string =>
    optionsOf(routeKey).title ?? fallback
  // The content HeaderBar's own shape — the thing tasks-app's README named
  // as a structural-sounding complaint ("one content header shared by the
  // whole navigator") and the PRD allowed finding a real gap. It is not
  // one: descriptor options already merge navigator-level `screenOptions`
  // with the active screen's own `options`, and `navigation.setOptions()`
  // (called from inside the screen, in an effect keyed on the screen's own
  // "what am I showing" state) re-resolves them on every call — this is
  // core react-navigation behavior, nothing built here. Reading
  // headerLeft/headerRight/headerTitle off the ACTIVE descriptor on every
  // render is the entire fix.
  const activeOptions = optionsOf(active.key)
  const activeButtons = activeOptions.headerButtons ?? headerButtons

  // Selecting a sidebar row while collapsed must reveal the content page —
  // AdwNavigationSplitView already defines the mini push/pop for that
  // (`showContent`), so this is a plain native property write through the
  // ref, not React state. Reads `getCollapsed()` live: when collapseWidth
  // is unset the split view never collapses, so this is always a no-op.
  const showContentIfCollapsed = (): void => {
    const splitView = splitViewRef.current
    if (splitView?.getCollapsed()) {
      splitView.setShowContent(true)
    }
  }

  const splitView = (
    <AdwNavigationSplitView
      ref={splitViewRef}
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
                // row-selected does not refire for a re-click on the
                // ALREADY-selected row (GTK only emits it on a selection
                // CHANGE) — found while testing the collapsed back-button
                // path: without this, re-clicking the same row after the
                // native back button hid content left the user stranded
                // on the sidebar. row-activated fires on every click
                // regardless, so it carries only the showContent side —
                // the dispatch above already covers an actual selection
                // change, and calling it twice for one click would be a
                // harmless but pointless duplicate dispatch.
                onRowActivated={showContentIfCollapsed}
              >
                {state.routes.map((route) => {
                  const options = optionsOf(route.key)
                  return (
                    <AdwActionRow
                      key={route.key}
                      title={titleOf(route.key, route.name)}
                      prefix={
                        options.color ? (
                          <GtkBox
                            valign={Gtk.Align.CENTER}
                            cssClasses={[listDot(options.color)]}
                            accessibleRole={Gtk.AccessibleRole.PRESENTATION}
                          />
                        ) : options.icon ? (
                          <GtkImage iconName={options.icon} />
                        ) : undefined
                      }
                      suffix={
                        options.count && options.count > 0 ? (
                          <GtkLabel
                            valign={Gtk.Align.CENTER}
                            cssClasses={["dimmed", "numeric"]}
                          >
                            {String(options.count)}
                          </GtkLabel>
                        ) : undefined
                      }
                    />
                  )
                })}
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
              titleWidget={
                activeOptions.headerTitle ? (
                  <IntrinsicContent>
                    {activeOptions.headerTitle()}
                  </IntrinsicContent>
                ) : undefined
              }
              start={
                activeOptions.headerLeft ? (
                  <IntrinsicContent>
                    {activeOptions.headerLeft()}
                  </IntrinsicContent>
                ) : undefined
              }
              end={[
                ...(activeOptions.headerRight
                  ? [
                      <IntrinsicContent key="header-right">
                        {activeOptions.headerRight()}
                      </IntrinsicContent>,
                    ]
                  : []),
                ...(activeButtons?.map((button) => (
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
          {/* Keyed by route: switching sections swaps the whole screen —
                a fresh SlotContent per section, the previous one disposes. */}
          <SlotContent key={active.key}>
            {activeDescriptor?.render()}
          </SlotContent>
        </AdwToolbarView>
      </AdwNavigationPage>
    </AdwNavigationSplitView>
  )

  return (
    <NavigationContent>
      {collapseWidth === undefined ? (
        splitView
      ) : (
        // A breakpoint's setters may only target widgets INSIDE the bin
        // they're attached to, never the bin itself (Adwaita's own
        // restriction) — so the split view must be the bin's child.
        <AdwBreakpointBin
          breakpoints={
            <AdwBreakpoint
              ref={breakpointRef}
              condition={Adw.BreakpointCondition.newLength(
                Adw.BreakpointConditionLengthType.MAX_WIDTH,
                collapseWidth,
                Adw.LengthUnit.SP,
              )}
            />
          }
        >
          {splitView}
        </AdwBreakpointBin>
      )}
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
