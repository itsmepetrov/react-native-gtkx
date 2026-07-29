import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Gtk, GtkFixed } from "../gtkx-bridge/index.js"
import type { StyleProp } from "../contracts.js"
import { HostNodeContext } from "./host-node.js"
import { useLayoutChild, type LayoutEvent } from "./use-layout-child.js"

export type PressableStateCallbackType = {
  pressed: boolean
  hovered: boolean
}

export type PressEvent = { nativeEvent: { x: number; y: number } }

export type PressableProps = {
  style?: StyleProp | ((state: PressableStateCallbackType) => StyleProp)
  children?: ReactNode | ((state: PressableStateCallbackType) => ReactNode)
  onPress?: (event: PressEvent) => void
  onPressIn?: (event: PressEvent) => void
  onPressOut?: (event: PressEvent) => void
  onLongPress?: (event: PressEvent) => void
  onHoverIn?: () => void
  onHoverOut?: () => void
  disabled?: boolean
  delayLongPress?: number
  onLayout?: (event: LayoutEvent) => void
  testID?: string
}

const pressEvent = (x: number, y: number): PressEvent => ({
  nativeEvent: { x, y },
})

// A View with a click gesture and hover tracking. State-dependent style and
// children follow the RN Pressable function-prop contract.
export const Pressable = ({
  style,
  children,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  onHoverIn,
  onHoverOut,
  disabled = false,
  delayLongPress = 500,
  onLayout,
  testID,
}: PressableProps) => {
  const widgetRef = useRef<Gtk.Fixed | null>(null)
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  const state: PressableStateCallbackType = { pressed, hovered }

  // RC1-WORKAROUND(controllers-as-children): see docs/gtkx-rc1-vs-main.md
  // rc.1 has no controller-as-JSX-children support (main-only feature):
  // gestures are attached imperatively; handlers read the latest props via a
  // ref so the controllers are wired exactly once.
  const handlersRef = useRef({
    handlePressed: (n: number, x: number, y: number): void => {
      void n
      void x
      void y
    },
    handleReleased: (n: number, x: number, y: number): void => {
      void n
      void x
      void y
    },
    handleCancel: (): void => {},
    handleEnter: (): void => {},
    handleLeave: (): void => {},
  })
  const resolvedStyle = typeof style === "function" ? style(state) : style
  const resolvedChildren =
    typeof children === "function" ? children(state) : children

  const { host, node, cssClass } = useLayoutChild(widgetRef, {
    style: resolvedStyle,
    onLayout,
  })

  const clearLongPress = (): void => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handlePressed = (_n: number, x: number, y: number): void => {
    if (disabled) {
      return
    }
    longPressFired.current = false
    setPressed(true)
    onPressIn?.(pressEvent(x, y))
    if (onLongPress) {
      clearLongPress()
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true
        onLongPress(pressEvent(x, y))
      }, delayLongPress)
    }
  }

  const handleReleased = (_n: number, x: number, y: number): void => {
    if (disabled) {
      return
    }
    clearLongPress()
    setPressed(false)
    onPressOut?.(pressEvent(x, y))
    if (!longPressFired.current) {
      onPress?.(pressEvent(x, y))
    }
  }

  const handleCancel = (): void => {
    clearLongPress()
    setPressed(false)
  }

  handlersRef.current = {
    handlePressed,
    handleReleased,
    handleCancel,
    handleEnter: () => {
      setHovered(true)
      onHoverIn?.()
    },
    handleLeave: () => {
      setHovered(false)
      onHoverOut?.()
    },
  }

  useLayoutEffect(() => {
    const widget = widgetRef.current
    if (!widget) {
      return
    }
    const click = new Gtk.GestureClick()
    click.on("pressed", (n: number, x: number, y: number) =>
      handlersRef.current.handlePressed(n, x, y),
    )
    click.on("released", (n: number, x: number, y: number) =>
      handlersRef.current.handleReleased(n, x, y),
    )
    click.on("cancel", () => handlersRef.current.handleCancel())
    widget.addController(click)

    const motion = new Gtk.EventControllerMotion()
    motion.on("enter", () => handlersRef.current.handleEnter())
    motion.on("leave", () => handlersRef.current.handleLeave())
    widget.addController(motion)

    return () => {
      widget.removeController(click)
      widget.removeController(motion)
    }
  }, [])

  return (
    <GtkFixed
      ref={widgetRef}
      name={testID}
      cssClasses={cssClass ? [cssClass] : []}
    >
      <HostNodeContext.Provider
        value={{ engine: host.engine, node, widgetRef }}
      >
        {resolvedChildren}
      </HostNodeContext.Provider>
    </GtkFixed>
  )
}

export type TouchableOpacityProps = Omit<PressableProps, "style"> & {
  style?: StyleProp
  activeOpacity?: number
}

// Classic RN touchable: dims itself while pressed via widget opacity.
export const TouchableOpacity = ({
  style,
  activeOpacity = 0.5,
  ...rest
}: TouchableOpacityProps) => (
  <Pressable
    {...rest}
    style={({ pressed }) => [style, pressed && { opacity: activeOpacity }]}
  />
)
