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
//
// Collapsed-pane sync is the same two-way protocol, one property lower:
// `AdwNavigationSplitView.showContent` decides which pane is visible while
// collapsed, the same role `NavigationStack`'s tag stack plays for the
// stack navigator.
// - state → widget: any route becoming active — a row click OR a
//   programmatic navigate()/jumpTo() — reveals content. Re-activating the
//   ALREADY-active row (state does not change) still needs to reveal
//   content too, which is why this rides BOTH the state.index effect and
//   row-activated (GTK's row-selected does not refire without an actual
//   selection change).
// - widget → state: the split view's own back affordance (back button,
//   Escape, back gesture) flips `showContent` to false with no
//   react-navigation involvement at all — the counterpart to the stack
//   navigator's native pop. Unlike a stack pop, nothing is removed from
//   TabRouter's state (the same route stays focused, only the pane
//   changed), so there is nothing to dispatch; this is purely observed and
//   re-emitted as `SidebarNavigationEventMap`'s `sidebarShown`, for an app
//   that wants to react (see docs/research/navigation-extensibility.md).
// - the echo guard: the state → widget side only ever WRITES `true`, and
//   the widget → state side only ever REACTS to `false` — two disjoint
//   values, so neither direction can mistake the other's write for a
//   widget-initiated back and re-trigger it. See docs/api.md for the
//   evidence on window-resize behavior (selection and pane both survive an
//   expand/re-collapse round trip unchanged, by the widget's own design,
//   not by any code here).
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
import { HeaderSlotContent, SlotContent, WidgetContent } from "../common"
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
  "contentLayout",
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
  /** How this screen's body is mounted into the content page.
   *
   *  - `"react-native"` (default): the body is a React Native tree, so it
   *    gets a Yoga layout root that fills the pane — `<View style={{ flex: 1 }}>`
   *    and friends behave exactly as they do anywhere else.
   *  - `"widget"`: the body IS a GTK widget tree (a `GtkScrolledWindow`
   *    around a `.boxed-list` `GtkListBox`, say) and is packed into the page
   *    directly, with no layout root in between. GTK's own sizing —
   *    `vexpand`, `AdwClamp`, a list's natural height — then works normally.
   *    Under the default a widget tree collapses instead: every widget
   *    becomes a single Yoga LEAF measured for its own natural size, so a
   *    scrolled window reports the ~1px it can shrink to and the pane comes
   *    up empty. `examples/tasks-nav` is built this way.
   *
   *  Mixing is per SCREEN, not per subtree: a `"widget"` screen that wants
   *  React Native content somewhere inside it wraps that part in
   *  `SlotContent` (or `IntrinsicContent`) itself. */
  contentLayout?: "react-native" | "widget"
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

// Matches the shape of StackNavigationEventMap (src/navigation/index.tsx):
// a real react-navigation event, not a bespoke navigator prop, so it is
// consumed the standard way (`navigation.addListener` / `options.listeners`)
// with no second protocol for an app to learn.
export type SidebarNavigationEventMap = {
  /**
   * The split view's own back affordance (back button, Escape, the back
   * gesture) hid the content pane while collapsed, returning to the
   * sidebar — `AdwNavigationSplitView`'s `showContent` going false, the
   * counterpart to the stack navigator's native pop. Unlike a stack pop,
   * TabRouter's state does NOT change: nothing was removed, the same route
   * stays focused, only the pane did. Fired on the currently active route,
   * so an app that wants to react — e.g. resetting an in-screen "item
   * open" state that only makes sense while content is visible, the way
   * `examples/tasks-nav`'s `ContentScreen` does — can listen without
   * polling the split view itself.
   *
   * Never fired when `collapseWidth` is unset (uncollapsed behavior is
   * unchanged), and never fired for content being REVEALED — that
   * direction already shows up as an ordinary state change (the newly
   * focused route re-rendering), so it needs no event of its own. See
   * docs/research/navigation-extensibility.md for why no event exists for
   * the forward direction.
   */
  sidebarShown: { data: undefined }
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
      SidebarNavigationEventMap
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
    // Every route becoming active reveals content while collapsed, not
    // just a row CLICK — found empirically (see updates/001/progress.md):
    // a plain programmatic navigate()/jumpTo() (no row involved at all)
    // changed state and re-selected the row above, but nothing told the
    // split view to show it, leaving the user stranded on the sidebar
    // exactly like the reported bug, just without a click in the loop.
    // Re-clicking the row already at this index does NOT come through
    // here (state.index does not change), which is exactly why
    // onRowActivated below still needs its own call.
    showContentIfCollapsed()
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

  // Widget → state: AdwNavigationSplitView's `showContent` notifies on
  // EVERY change, including the ones showContentIfCollapsed above just
  // made (value: true) — filtered out here, since this code only ever
  // WRITES `true` itself, so a `false` can only originate from the split
  // view's own back affordance (back button, Escape, back gesture). No
  // react-navigation state changes as a result (see
  // SidebarNavigationEventMap's doc for why there is nothing TO change),
  // only an event an app may listen for. This asymmetry — forward writes
  // filtered by value on this side, backward reads never touching
  // state.index on the other — is what keeps the two directions from ever
  // triggering each other.
  const handleShowContentChanged = (value: boolean | null): void => {
    if (value !== false || collapseWidth === undefined) {
      return
    }
    navigation.emit({
      type: "sidebarShown",
      target: state.routes[state.index]!.key,
    })
  }

  const splitView = (
    <AdwNavigationSplitView
      ref={splitViewRef}
      // Adwaita's own defaults for a sidebar of rows. Set explicitly
      // because they are what keeps the sidebar's width off the window's
      // minimum now that the scrolled window no longer propagates it.
      minSidebarWidth={180}
      maxSidebarWidth={280}
      onNotifyShowContent={handleShowContentChanged}
      sidebar={
        <AdwNavigationPage
          title={sidebarTitle}
          tag="sidebar"
        >
          <AdwToolbarView topBar={<AdwHeaderBar />}>
            {/* The list must not dictate the window minimum: the sidebar
                scrolls when the window is shorter than its rows — the
                Adwaita sidebar pattern (and RN semantics: scrolling is
                explicit, never the window's).

                Deliberately NOT propagateNaturalWidth, which does the
                opposite on the other axis: it makes the scrolled window
                request the widest ROW's width, so one long title becomes a
                floor the whole window cannot be resized below (seen as
                "AdwNavigationSplitView exceeds AdwBreakpointBin width:
                requested 469 px, 360 px available" in the journal, and felt
                as a window that stops shrinking early). The split view sizes
                the sidebar itself — see minSidebarWidth/maxSidebarWidth
                below — which is the Adwaita answer and leaves long titles to
                ellipsize instead of pushing the window around. */}
            <GtkScrolledWindow hscrollbarPolicy={Gtk.PolicyType.NEVER}>
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
                  <HeaderSlotContent>
                    {activeOptions.headerTitle()}
                  </HeaderSlotContent>
                ) : undefined
              }
              start={
                activeOptions.headerLeft ? (
                  <HeaderSlotContent>
                    {activeOptions.headerLeft()}
                  </HeaderSlotContent>
                ) : undefined
              }
              end={[
                ...(activeOptions.headerRight
                  ? [
                      <HeaderSlotContent key="header-right">
                        {activeOptions.headerRight()}
                      </HeaderSlotContent>,
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
                a fresh root per section, the previous one disposes. */}
          {activeOptions.contentLayout === "widget" ? (
            <WidgetContent key={active.key}>
              {activeDescriptor?.render()}
            </WidgetContent>
          ) : (
            <SlotContent key={active.key}>
              {activeDescriptor?.render()}
            </SlotContent>
          )}
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
        //
        // widthRequest/heightRequest: Adwaita's own contract for
        // AdwBreakpointBin — adding a breakpoint makes it report NO minimum
        // size, and its docs say these properties "must always be set" in
        // that case (otherwise it warns on every use: "does not have a
        // minimum size, set the 'width-request' and 'height-request'
        // properties to specify it"). This bin's actual size always comes
        // from our own Yoga layout (wrapReactNative allocates it the
        // engine-computed rect regardless of GTK's own size negotiation), so
        // there is no separate GTK-side minimum to declare and any value
        // satisfies the contract — 1, not 0: the current @gtkx property
        // diffing treats 0 as "unset" for numeric props (falsy skip) and
        // never issues the native call, which would silently defeat the
        // point. 1px is functionally identical to 0 here either way.
        <AdwBreakpointBin
          widthRequest={1}
          heightRequest={1}
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

// Mirrors src/navigation/index.tsx's StackNavigationHelpers: a screen that
// reaches its navigation prop through `useNavigation()` rather than
// `SidebarScreenProps` (e.g. one `component` shared across several routes,
// as `examples/tasks-nav`'s `ContentScreen` is) still needs a typed handle
// on `sidebarShown` — `useNavigation<SidebarNavigationHelpers>()` gives it
// one without spelling out the full `NavigationProp` generic list.
export type SidebarNavigationHelpers<
  ParamList extends ParamListBase = ParamListBase,
  RouteName extends keyof ParamList = keyof ParamList,
> = NavigationProp<
  ParamList,
  RouteName,
  TabNavigationState<ParamList>,
  SidebarNavigationOptions,
  SidebarNavigationEventMap
>

export type SidebarScreenProps<
  ParamList extends ParamListBase = ParamListBase,
  RouteName extends keyof ParamList = keyof ParamList,
> = {
  route: RouteProp<ParamList, RouteName>
  navigation: SidebarNavigationHelpers<ParamList, RouteName>
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
  EventMap: SidebarNavigationEventMap
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
