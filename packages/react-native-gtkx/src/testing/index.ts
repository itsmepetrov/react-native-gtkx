import { render, renderHook } from "@gtkx/testing"
import type {
  RenderHookOptions,
  RenderHookResult,
  RenderResult,
} from "@gtkx/testing"

// react-native-gtkx/testing — @gtkx/testing's queries, render, renderHook,
// fireEvent and userEvent already operate on the real GTK widget tree our
// RN components render into, so `getByText` on a `Text` or `userEvent.click`
// on a `Pressable` already work with no RN-flavoured wrapper: this subpath
// re-exports that surface as-is, one import source for a consumer, plus the
// one genuinely repeated workaround (see below).
//
// @gtkx/testing 1.0 semantics worth knowing before writing a new gtk test
// (audited against the whole suite; nothing here needed a source change,
// so it is recorded here rather than fixed):
//
// - Every query (`getByText`, `getByRole`, `screen.*`, …) only ever matches
//   a MAPPED widget (`widget.getMapped()`) — a covered stack/sidebar page,
//   an unpresented window, or anything with `visible={false}` is invisible
//   to a query even though it is still in the tree. `{ hidden: true }`
//   does NOT override this: it only widens the SEPARATE accessible-tree
//   "hidden" filter `getByRole` applies on top. A widget that stays
//   mounted-but-covered (createStackNavigator's inactive pages, an
//   AdwNavigationSplitView pane hidden by collapse) is exactly this case —
//   query only the active/visible one, the way every current test already
//   does.
// - `userEvent.click`/`dblClick`/`tripleClick`/`pointer` now walk outward
//   from the named widget through GTK's real claiming chain (the first
//   Gtk.Button, list-box/flow-box row, or authored click gesture) instead
//   of rc.4's "activate, else the nearest ancestor with any GestureClick".
//   Unused anywhere in this repo's own tests today — every gesture/press
//   test drives a real `zwlr_virtual_pointer_v1` or emits the GtkGesture
//   signal directly (`fireEvent`) precisely because @gtkx/testing's click
//   helpers still never produce a GdkEvent, targeting change or not.
// - Accessible reads (`toHaveAccessibleName`, `getByRole`'s `name`/`value`
//   options, …) go through `gtk_test_accessible_check_*` with WAI-ARIA
//   naming precedence and GTK mnemonic markers (`_`) stripped from any
//   label with `use-underline` set. Not a concern for react-native-gtkx's
//   own widgets today — nothing in the bridge sets `use-underline`.
export * from "@gtkx/testing"

// RC4-WORKAROUND(renderhook-no-window): see docs/gtkx-rc4-notes.md
// @gtkx/testing's renderHook() always mounts its test component into a bare
// Gtk.Box, so a hook that reads the active toplevel (useWindowDimensions,
// anything through Gtk.Window.getToplevels()) has nothing to read. render()
// always creates and presents a harness window when no container is given,
// regardless of what it renders — rendering null is enough to get one.

/**
 * Like `renderHook`, but first creates and presents a harness window (via
 * `render(null)`), so window-dependent hooks have a toplevel to read.
 * Cleanup is automatic — @gtkx/testing tears down every active render
 * (including the harness window) after each test.
 */
export function renderHookWithWindow<Result>(
  callback: () => Result,
  options?: RenderHookOptions<undefined>,
): Promise<
  RenderHookResult<Result, undefined> & { window: RenderResult["container"] }
>
export function renderHookWithWindow<Result, Props>(
  callback: (props: Props) => Result,
  options: RenderHookOptions<Props>,
): Promise<
  RenderHookResult<Result, Props> & { window: RenderResult["container"] }
>
export async function renderHookWithWindow<Result, Props>(
  callback: (props?: Props) => Result,
  options?: RenderHookOptions<Props>,
): Promise<
  RenderHookResult<Result, Props> & { window: RenderResult["container"] }
> {
  const { container: window } = await render(null)
  const hook = await renderHook(
    callback as (props: Props) => Result,
    options as RenderHookOptions<Props>,
  )
  return { ...hook, window }
}
