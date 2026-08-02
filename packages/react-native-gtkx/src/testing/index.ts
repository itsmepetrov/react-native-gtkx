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
