// react-native has no concept of raw GTK CSS — react-native-gtkx/gtk
// re-exports @gtkx/css's tagged template directly (see
// docs/architecture/overview.md), the same one the style prop's visual half
// uses under the hood.
import { css } from "react-native-gtkx/gtk"

export const listDot = (color: string): string => css`
  min-width: 12px;
  min-height: 12px;
  border-radius: 9999px;
  background: ${color};
`

export const detailNotes = css`
  padding: 6px;
  min-height: 160px;
`
