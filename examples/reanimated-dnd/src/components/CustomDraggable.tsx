// PORTED from react-native-reanimated-dnd's example app (MIT).
//
// This is the file the port learned the most from, because it is the only
// one that consumes `useDraggable` rather than `<Draggable>` — and a hook
// whose whole job is "you render the view yourself" cannot hide a platform
// difference the way a component can. The structure below is upstream's,
// context and handle registration and all; three lines are different, and
// each one names the same fact.
//
//   upstream                          here
//   ------------------------------    ------------------------------------
//   const { …, gesture } =            const { …, dragControllers } =
//     useDraggable(…)                   useDraggable(…)
//   <GestureDetector gesture={…}>     {dragControllers}   (a child, not a
//     <Animated.View>…                 wrapper — the drag is a property of
//                                      the WIDGET here, not of a gesture
//                                      recogniser wrapped around it)
//   <Animated.View style={…}>         <View style={…}>
//
// `animatedViewProps` keeps its upstream NAME on purpose (the mirror's
// point), and its contents are what differ: upstream's is a Reanimated
// `style` that moves the view, ours is `children` — the GtkDragSource. The
// view never moves here; GDK carries a picture of it.
//
// The handle half needed no change at all beyond the wrapper: registering a
// handle through context, and the item deferring to it, is upstream's design
// and this platform's too.
import {
  createContext,
  useContext,
  useEffect,
  type ComponentType,
  type ReactNode,
} from "react"
import { View } from "react-native"
import type { StyleProp } from "react-native"
import {
  useDraggable,
  type UseDraggableOptions,
} from "react-native-reanimated-dnd"

export interface CustomDraggableProps<
  TData = unknown,
> extends UseDraggableOptions<TData> {
  initialStyle?: StyleProp
  children: ReactNode
}

type CustomDraggableHookOptions<TData> = UseDraggableOptions<TData> & {
  children: ReactNode
  handleComponent: ComponentType<unknown>
}

// Create a context for CustomDraggable
interface CustomDraggableContextValue {
  // Upstream's field is `gesture` (an RNGH Gesture object). Here the drag
  // source is a React node the claiming view renders, so the field carries
  // that instead — same role, different medium.
  dragControllers: ReactNode
  registerHandle: (registered: boolean) => void
}

const CustomDraggableContext =
  createContext<CustomDraggableContextValue | null>(null)

// Handle component for CustomDraggable - completely isolated
interface CustomDraggableHandleProps {
  children: ReactNode
  style?: StyleProp
}

const CustomDraggableHandle = ({
  children,
  style,
}: CustomDraggableHandleProps) => {
  const draggableContext = useContext(CustomDraggableContext)

  useEffect(() => {
    draggableContext?.registerHandle(true)
    return () => {
      draggableContext?.registerHandle(false)
    }
  }, [draggableContext])

  if (!draggableContext) {
    console.warn(
      "CustomDraggable.Handle must be used within a CustomDraggable component",
    )
    return <>{children}</>
  }

  return (
    <View style={style}>
      {draggableContext.dragControllers}
      {children}
    </View>
  )
}

// Set display name to help with debugging
CustomDraggableHandle.displayName = "CustomDraggableHandle"

const CustomDraggableComponent = <TData = unknown,>({
  children,
  initialStyle,
  ...draggableOptions
}: CustomDraggableProps<TData>) => {
  const dragOptions = draggableOptions as UseDraggableOptions<TData>
  const {
    animatedViewProps,
    dragControllers,
    animatedViewRef,
    registerHandle,
  } = useDraggable<TData>({
    ...dragOptions,
    children,
    handleComponent: CustomDraggableHandle,
  } as CustomDraggableHookOptions<TData>)

  const combinedStyle = [initialStyle, animatedViewProps.style]

  // Create context value
  const contextValue: CustomDraggableContextValue = {
    dragControllers,
    registerHandle,
  }

  // Upstream branches here on `hasHandle`: with a handle the view renders
  // bare and the handle owns the GestureDetector, without one the whole view
  // is wrapped in it. The same branch exists here — it is just that
  // `animatedViewProps.children` IS that branch already (the hook returns
  // the controllers only while no handle has claimed them), so the view is
  // written once.
  return (
    <View
      ref={animatedViewRef}
      style={combinedStyle}
    >
      {animatedViewProps.children}
      <CustomDraggableContext.Provider value={contextValue}>
        {children}
      </CustomDraggableContext.Provider>
    </View>
  )
}

// Attach Handle as a static property
export const CustomDraggable = Object.assign(CustomDraggableComponent, {
  Handle: CustomDraggableHandle,
})
