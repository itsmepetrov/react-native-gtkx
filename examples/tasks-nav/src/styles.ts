// Raw GTK CSS for the two things the style prop cannot express.
// react-native-gtkx/gtk re-exports @gtkx/css's tagged template directly (see
// docs/platform-layer.md), the same one the style prop's visual half uses
// underneath — so this is the supported path, not an escape hatch.
import { css } from "react-native-gtkx/gtk"

/** A list's color, as the round swatch the "New List" dialog offers. The
 *  sidebar's own colored dots come from the navigator's `color` screen
 *  option and are drawn by it — this is only for the dialog, which is the
 *  app's own widget tree. */
export const listDot = (color: string): string => css`
  min-width: 12px;
  min-height: 12px;
  border-radius: 9999px;
  background: ${color};
`

/** GtkTextView draws its text hard against its own edge; a card around it
 *  needs the padding put back. */
export const detailNotes = css`
  padding: 6px;
`
