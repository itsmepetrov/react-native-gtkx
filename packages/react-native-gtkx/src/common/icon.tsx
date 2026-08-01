// A named icon from the desktop icon theme, in React Native layout.
//
// WHY this is not `Image`. RN's `Image` takes a file path or a URI, because on
// iOS and Android an icon is an asset the app ships. On the Linux desktop an
// icon is a NAME resolved against the current icon theme at paint time —
// `user-trash-symbolic` recolours itself with the label colour, follows the
// user's theme, and has no file the app could point at. There is nothing in
// RN's `Image` contract that can express that, and pretending a name is a URI
// would break `onError`, `resizeMode` and the loading states along with it.
//
// So this is the same shape RN apps already reach for on every platform —
// react-native-vector-icons' `<Icon name size color />` — with the desktop
// icon theme behind it instead of a bundled font.
import type { ReactNode } from "react"
import type { StyleProp } from "../contracts"
import { GtkImage } from "../gtkx/bridge/index"
import { Widget } from "./widget"

export type IconProps = {
  /** Icon-theme name, e.g. `"starred-symbolic"`. Symbolic icons take their
   *  colour from the surrounding label colour. */
  name: string
  /** Square size in RN units. Defaults to 16, the size Adwaita uses for icons
   *  inside list rows and flat buttons. */
  size?: number
  /** React Native style. Sizing here wins over `size`. */
  style?: StyleProp
  testID?: string
}

/**
 * ```tsx
 * <Icon name="starred-symbolic" size={16} />
 * ```
 *
 * Sized through `pixel-size` as well as through Yoga: GTK would otherwise pick
 * the nearest theme size and paint at that, so a 16-unit box could hold a
 * 24px icon scaled down.
 */
export const Icon = ({
  name,
  size = 16,
  style,
  testID,
}: IconProps): ReactNode => (
  <Widget
    testID={testID}
    style={[{ width: size, height: size }, style]}
  >
    <GtkImage
      iconName={name}
      pixelSize={size}
    />
  </Widget>
)
