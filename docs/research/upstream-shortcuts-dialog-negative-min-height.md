# Upstream draft: empty AdwShortcutsDialog reports a negative minimum height

Status: verified, not yet filed. Not found in libadwaita's issue tracker
(searched `AdwWrapBox`, `WrapBox`, `min height`, `-12`, `sizes must be`,
`shortcuts dialog`, `ShortcutsDialog`, `empty shortcuts` — the closest hits,
#1129 "GTK warnings opening an AdwShortcutsDialog" and #1049
"shortcuts-dialog: Criticals when using a non-resizable window", are both
closed and about unrelated warnings). MR !1356 ("AdwWrapBox fixes") predates
this: merged December 2024, long before the version this was verified
against. Not fixed in the current stable release.

Below is the report as intended for GNOME/libadwaita's GitLab. Title and
body are separated for easy copy-paste; nothing here mentions
react-native-gtkx, since the repro needs none of it.

---

## Title

`AdwShortcutsDialog` with no sections logs `AdwWrapBox … reported min
height -12, but sizes must be >= 0`

## Summary

Presenting an `AdwShortcutsDialog` that has zero `AdwShortcutsSection`
children logs a `Gtk-WARNING` from an internal `AdwWrapBox` reporting a
negative minimum height, during `present()`, before the dialog is shown or
anything is measured by the caller. A dialog with at least one section does
not warn.

## Steps to reproduce

Minimal C, no application window content beyond the dialog itself:

```c
// bug1.c
// Build: gcc bug1.c -o bug1 $(pkg-config --cflags --libs gtk4 libadwaita-1)
#include <adwaita.h>

static gboolean quit_cb(gpointer app) {
  g_application_quit(G_APPLICATION(app));
  return G_SOURCE_REMOVE;
}

static void activate(GtkApplication *app, gpointer user_data) {
  AdwWindow *win = ADW_WINDOW(adw_window_new());
  gtk_window_set_application(GTK_WINDOW(win), app);
  gtk_window_present(GTK_WINDOW(win));

  AdwShortcutsDialog *dialog = ADW_SHORTCUTS_DIALOG(adw_shortcuts_dialog_new());
  adw_dialog_present(ADW_DIALOG(dialog), GTK_WIDGET(win));

  g_timeout_add(300, quit_cb, app);
}

int main(int argc, char **argv) {
  adw_init();
  GtkApplication *app =
      gtk_application_new("org.example.Bug1", G_APPLICATION_DEFAULT_FLAGS);
  g_signal_connect(app, "activate", G_CALLBACK(activate), NULL);
  int status = g_application_run(G_APPLICATION(app), argc, argv);
  g_object_unref(app);
  return status;
}
```

Run it and the warning appears immediately, before the 300 ms timeout fires
and closes the window:

```
$ ./bug1
(process:52169): Gtk-WARNING **: AdwWrapBox 0xbfd6d43656d0 (wrap-box) reported min height -12, but sizes must be >= 0
(process:52169): Gtk-WARNING **: AdwWrapBox 0xbfd6d43656d0 (wrap-box) reported min height -12, but sizes must be >= 0
```

### Control (does not warn)

The same dialog with a single, empty `AdwShortcutsSection` added is silent:

```c
AdwShortcutsDialog *dialog = ADW_SHORTCUTS_DIALOG(adw_shortcuts_dialog_new());
AdwShortcutsSection *section = ADW_SHORTCUTS_SECTION(adw_shortcuts_section_new("Test"));
adw_shortcuts_dialog_add(dialog, section);
adw_dialog_present(ADW_DIALOG(dialog), GTK_WIDGET(win));
```

Verified both ways on the environment below — zero sections warns twice per
present(), one section is silent.

## Expected behavior

No warning either way; a widget's reported minimum size should never be
negative, and an _empty_ container is the case most obligated to report
`[0, 0]` rather than a negative number.

## Actual behavior

```
Gtk-WARNING **: AdwWrapBox 0x… (wrap-box) reported min height -12, but sizes must be >= 0
```

Logged twice per `present()` (once for the minimum-size query, once for
natural size, both landing on the same negative value in this case).

## Impact

This is not cosmetic-only noise confined to one app: `AdwShortcutsDialog` is
the documented, recommended replacement for `GtkShortcutsWindow`, and is
commonly presented from an action with no guard against a section list that
is empty at the time of construction (e.g. filled asynchronously, or reached
before content is registered). Every consumer that presents one before
populating it gets this warning on stderr — in a flatpak sandbox or under
`G_DEBUG=fatal-warnings` (common in test suites and CI) this is a hard
failure, not just log noise.

## Root cause (read from the 1.9.1 source, not just observed)

The internal wrap box lives at `src/adw-shortcuts-dialog.ui` as `nav_box`
(an `AdwWrapBox` used for the dialog's search/category row), and its size is
computed by `adw_wrap_layout_measure()` in `src/adw-wrap-layout.c`. The
perpendicular-to-pack-direction branch (used for height, when packing is
horizontal) is:

```c
// src/adw-wrap-layout.c, adw_wrap_layout_measure(), ~line 609-627 (v1.9.1)
line_data = compute_sizes (self, widget, for_size, child_spacing, &n_lines, &child_data);

/* ... accumulate min/nat over n_lines, each starting at 0 ... */

min += line_spacing * (n_lines - 1);
nat += line_spacing * (n_lines - 1);
```

`count_lines()` (same file) correctly returns `0` for zero visible children
— the `while (n_children > 0)` loop never runs. With `n_lines == 0`, the
last two lines above compute `line_spacing * (0 - 1)`, i.e. `-line_spacing`,
and nothing after this clamps it back to `>= 0`. The multiplier assumes at
least one line and needs a floor at `0` (equivalently, skip the `+=`
entirely when `n_lines == 0`).

This is also why a downstream consumer cannot observe or work around the
negative value: `gtk_widget_measure()` itself clamps a negative minimum to 0
before returning it to any caller, so the value only ever surfaces as this
warning, never as an actual layout defect visible to the caller.

## Environment

- libadwaita 1.9.1-0ubuntu0.1 (`libadwaita-1-0:arm64`)
- GTK 4.22.4+ds-0ubuntu0.1 (`libgtk-4-1:arm64`)
- Ubuntu 26.04 LTS (Resolute Raccoon), kernel 7.0.0-28-generic, aarch64
- Reproduced under a headless wlroots (sway 1.11) Wayland compositor;
  nothing about the bug is backend- or architecture-specific — it is a pure
  arithmetic error in the measure path, hit before any surface is composited.
