# Upstream draft: AdwButtonContent dereferences NULL when rooted without a button ancestor

Status: verified, not yet filed. Not found in libadwaita's issue tracker
(searched `AdwButtonContent`, `ButtonContent`, `button content assertion`,
`get_parent assertion`, `ButtonContent crash`/`NULL`/`parent` — none of the
hits are this; closest by subject are #833 "Allow using AdwButtonContent in
list boxes" and #771 "Orientable ButtonContent?", both about API shape, not
this crash path). Not fixed in the current stable release.

Below is the report as intended for GNOME/libadwaita's GitLab. Title and
body are separated for easy copy-paste; nothing here mentions
react-native-gtkx, since the repro needs none of it.

---

## Title

`AdwButtonContent` dereferences NULL (two failed `GTK_IS_WIDGET` assertions)
when rooted without a `GtkButton` ancestor

## Summary

`AdwButtonContent` is documented as a helper for a button's child, but
nothing prevents constructing and rooting one outside a `GtkButton`. When
that happens, the widget's `root` vfunc looks for a button ancestor, doesn't
find one, and then uses the NULL result without a check — producing two
GLib/GTK critical assertion failures, not a warning.

## Steps to reproduce

Minimal C, no button anywhere in the tree — `GtkWindow` → `GtkBox` →
`AdwButtonContent`:

```c
// bug2.c
// Build: gcc bug2.c -o bug2 $(pkg-config --cflags --libs gtk4 libadwaita-1)
#include <adwaita.h>

static gboolean quit_cb(gpointer app) {
  g_application_quit(G_APPLICATION(app));
  return G_SOURCE_REMOVE;
}

static void activate(GtkApplication *app, gpointer user_data) {
  GtkWidget *win = gtk_application_window_new(app);
  GtkWidget *box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
  GtkWidget *content = adw_button_content_new();
  adw_button_content_set_label(ADW_BUTTON_CONTENT(content), "Test");
  adw_button_content_set_icon_name(ADW_BUTTON_CONTENT(content),
                                    "list-add-symbolic");

  gtk_box_append(GTK_BOX(box), content);
  gtk_window_set_child(GTK_WINDOW(win), box);
  gtk_window_present(GTK_WINDOW(win));

  g_timeout_add(300, quit_cb, app);
}

int main(int argc, char **argv) {
  GtkApplication *app =
      gtk_application_new("org.example.Bug2", G_APPLICATION_DEFAULT_FLAGS);
  g_signal_connect(app, "activate", G_CALLBACK(activate), NULL);
  int status = g_application_run(G_APPLICATION(app), argc, argv);
  g_object_unref(app);
  return status;
}
```

```
$ ./bug2
(bug2:51089): Gtk-CRITICAL **: gtk_widget_get_parent: assertion 'GTK_IS_WIDGET (widget)' failed
(bug2:51089): Gtk-CRITICAL **: gtk_widget_add_css_class: assertion 'GTK_IS_WIDGET (widget)' failed
```

### Control (does not warn)

The documented position — inside a `GtkButton` — is silent:

```c
GtkWidget *button = gtk_button_new();
GtkWidget *content = adw_button_content_new();
/* ...set label/icon... */
gtk_button_set_child(GTK_BUTTON(button), content);
gtk_window_set_child(GTK_WINDOW(win), button);
```

Verified both ways on the environment below — no button ancestor logs both
criticals every time the widget is rooted, a real button ancestor is silent.

## Expected behavior

Either: `AdwButtonContent` degrades gracefully when it has no button
ancestor (skips the styling step it can't perform), or it documents this as
a hard usage requirement enforced with a clear, single warning instead of
two low-level `GTK_IS_WIDGET` assertions that read like an unrelated GTK
internal error and give no hint what caused them or where.

## Actual behavior

```
gtk_widget_get_parent: assertion 'GTK_IS_WIDGET (widget)' failed
gtk_widget_add_css_class: assertion 'GTK_IS_WIDGET (widget)' failed
```

Two GLib/GTK criticals, not warnings — under `G_DEBUG=fatal-criticals` (or
`fatal-warnings`, which also covers criticals), this aborts the process.

## Impact

Unlike a log-noise warning, these are failed assertions from a NULL
dereference: they indicate the code proceeded past a state it explicitly
checked and found invalid. Any application, test harness, or accessibility/
introspection tool that walks a widget tree and happens to construct or
mount an `AdwButtonContent` before it's parented under its intended button
(common when building UI incrementally, or when generic component-mounting
code has no way to guarantee ordering) hits this — and under the common
CI/debug convention of promoting GLib criticals to fatal, it is a crash, not
a log line.

## Root cause (read from the 1.9.1 source, not just observed)

`src/adw-button-content.c`:

```c
static inline GtkWidget *
find_parent_button (AdwButtonContent *self)
{
  return gtk_widget_get_ancestor (GTK_WIDGET (self), GTK_TYPE_BUTTON);
}

static void
adw_button_content_root (GtkWidget *widget)
{
  AdwButtonContent *self = ADW_BUTTON_CONTENT (widget);

  GTK_WIDGET_CLASS (adw_button_content_parent_class)->root (widget);

  gtk_label_set_mnemonic_widget (GTK_LABEL (self->label),
                                 find_parent_button (self));

  self->button = gtk_widget_get_ancestor (GTK_WIDGET (self), GTK_TYPE_BUTTON);

  /* For AdwSplitButton we want to style the split button widget and not the
   * button inside. */
  if (ADW_IS_SPLIT_BUTTON (gtk_widget_get_parent (self->button)))
    self->button = gtk_widget_get_parent (self->button);

  gtk_widget_add_css_class (self->button, "image-text-button");
}
```

When there is no `GtkButton` ancestor, `gtk_widget_get_ancestor()` returns
NULL and `self->button` is set to NULL. The very next line calls
`gtk_widget_get_parent (self->button)` — first assertion. The type check
`ADW_IS_SPLIT_BUTTON(NULL)` itself tolerates NULL and evaluates false, so
control reaches `gtk_widget_add_css_class (self->button, …)` with
`self->button` still NULL — second assertion. The two lines match the two
functions named in the crash output, in the order they run.

A `self->button != NULL` guard around the split-button check and the
`add_css_class` call (or bailing out of `root()` early when no button
ancestor is found) would fix this without changing behavior in the
documented case. `adw_button_content_unroot()`, a few lines below, already
treats this same `self->button` as nullable (`if (self->button) { ... }`)
before removing the CSS class — `root()` just lacks the matching guard.

Built libadwaita 1.9.1 from source in a clean VM and confirmed: the two
criticals disappear with the guard added, the button and split-button cases
(covered by the existing `test-button-content.c`) are unaffected, and the
full test suite (67/67, plus one new test for this) stays green. Happy to
attach the patch (~10 lines, plus a test) to the issue or open it as a
linked merge request — whichever this project prefers.

## Environment

- libadwaita 1.9.1-0ubuntu0.1 (`libadwaita-1-0:arm64`)
- GTK 4.22.4+ds-0ubuntu0.1 (`libgtk-4-1:arm64`)
- Ubuntu 26.04 LTS (Resolute Raccoon), kernel 7.0.0-28-generic, aarch64
- Reproduced under a headless wlroots (sway 1.11) Wayland compositor;
  nothing about the bug is backend- or architecture-specific — it fires
  during widget rooting, independent of rendering.
