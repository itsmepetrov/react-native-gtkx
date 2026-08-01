// PORTED from react-native-reanimated-dnd's example app (MIT). Two lines
// changed, both on the navigator itself and neither on drag-and-drop:
//
// 1. `createStackNavigator`/`StackScreenProps` come from
//    `react-native-gtkx/navigation` rather than `@react-navigation/stack`.
//    That package cannot run here for the same reason the dnd library
//    cannot — RNGH and Reanimated at module scope — and this platform ships
//    its own stack navigator over Adw.NavigationView with the same
//    react-navigation router underneath, so `NavigationContainer`,
//    `navigation.navigate` and `navigation.goBack` below are unchanged.
//    It is NOT aliased by the presets: `@react-navigation/stack`'s surface
//    is far wider than the four names this implements (TransitionPresets,
//    CardStyleInterpolators, the header components), and aliasing it would
//    turn every one of those into a silent undefined. See docs/api.md.
// 2. `cardStyle` and `gestureDirection` leave `screenOptions` — the GTK
//    stack has one transition and one direction, and the option table
//    (docs/api.md) says so rather than accepting them and lying.
import { NavigationContainer } from "@react-navigation/native"
import {
  createStackNavigator,
  StackScreenProps,
} from "react-native-gtkx/navigation"
import {
  ActiveStylesExample,
  AlignmentOffsetExample,
  AnimationExample,
  BasicDragDropExample,
  BoundedDraggingExample,
  BoundedYAxisExample,
  CapacityExample,
  CollisionDetectionExample,
  CustomDraggableExample,
  DragHandlesExample,
  DragStateExample,
  DroppedItemsMapExample,
  DynamicHeightExample,
  XAxisConstrainedExample,
  YAxisConstrainedExample,
} from "@/components/examples"
import { ExamplesNavigationPage } from "@/components/ExamplesNavigationPage"
import { GridSortableExample } from "@/components/GridSortableExample"
import { HorizontalSortableExample } from "@/components/HorizontalSortableExample"
import { SortableExample } from "@/components/SortableExample"

export type RootStackParamList = {
  Home: undefined
  SortableExample: undefined
  DroppedItemsMapExample: undefined
  DragStateExample: undefined
  CollisionDetectionExample: undefined
  BasicDragDropExample: undefined
  AlignmentOffsetExample: undefined
  AnimationExample: undefined
  DragHandlesExample: undefined
  ActiveStylesExample: undefined
  BoundedDraggingExample: undefined
  XAxisConstrainedExample: undefined
  YAxisConstrainedExample: undefined
  BoundedYAxisExample: undefined
  CapacityExample: undefined
  CustomDraggableExample: undefined
  HorizontalSortableExample: undefined
  GridSortableExample: undefined
  DynamicHeightExample: undefined
}

const Stack = createStackNavigator<RootStackParamList>()

// Wrapper components that work with React Navigation
function HomeScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "Home">) {
  return (
    <ExamplesNavigationPage
      onNavigateToExample={(exampleName) => {
        navigation.navigate(exampleName as keyof RootStackParamList)
      }}
    />
  )
}

function SortableExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "SortableExample">) {
  return <SortableExample onBack={() => navigation.goBack()} />
}

function DroppedItemsMapExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "DroppedItemsMapExample">) {
  return <DroppedItemsMapExample onBack={() => navigation.goBack()} />
}

function DragStateExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "DragStateExample">) {
  return <DragStateExample onBack={() => navigation.goBack()} />
}

function CollisionDetectionExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "CollisionDetectionExample">) {
  return <CollisionDetectionExample onBack={() => navigation.goBack()} />
}

function BasicDragDropExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "BasicDragDropExample">) {
  return <BasicDragDropExample onBack={() => navigation.goBack()} />
}

function AlignmentOffsetExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "AlignmentOffsetExample">) {
  return <AlignmentOffsetExample onBack={() => navigation.goBack()} />
}

function AnimationExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "AnimationExample">) {
  return <AnimationExample onBack={() => navigation.goBack()} />
}

function DragHandlesExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "DragHandlesExample">) {
  return <DragHandlesExample onBack={() => navigation.goBack()} />
}

function ActiveStylesExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "ActiveStylesExample">) {
  return <ActiveStylesExample onBack={() => navigation.goBack()} />
}

function BoundedDraggingExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "BoundedDraggingExample">) {
  return <BoundedDraggingExample onBack={() => navigation.goBack()} />
}

function XAxisConstrainedExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "XAxisConstrainedExample">) {
  return <XAxisConstrainedExample onBack={() => navigation.goBack()} />
}

function YAxisConstrainedExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "YAxisConstrainedExample">) {
  return <YAxisConstrainedExample onBack={() => navigation.goBack()} />
}

function BoundedYAxisExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "BoundedYAxisExample">) {
  return <BoundedYAxisExample onBack={() => navigation.goBack()} />
}

function CapacityExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "CapacityExample">) {
  return <CapacityExample onBack={() => navigation.goBack()} />
}

function CustomDraggableExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "CustomDraggableExample">) {
  return <CustomDraggableExample onBack={() => navigation.goBack()} />
}

function HorizontalSortableExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "HorizontalSortableExample">) {
  return <HorizontalSortableExample onBack={() => navigation.goBack()} />
}

function GridSortableExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "GridSortableExample">) {
  return <GridSortableExample onBack={() => navigation.goBack()} />
}

function DynamicHeightExampleScreen({
  navigation,
}: StackScreenProps<RootStackParamList, "DynamicHeightExample">) {
  return <DynamicHeightExample onBack={() => navigation.goBack()} />
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false, // We'll use our custom headers
          gestureEnabled: true,
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
        />
        <Stack.Screen
          name="SortableExample"
          component={SortableExampleScreen}
        />
        <Stack.Screen
          name="DroppedItemsMapExample"
          component={DroppedItemsMapExampleScreen}
        />
        <Stack.Screen
          name="DragStateExample"
          component={DragStateExampleScreen}
        />
        <Stack.Screen
          name="CollisionDetectionExample"
          component={CollisionDetectionExampleScreen}
        />
        <Stack.Screen
          name="BasicDragDropExample"
          component={BasicDragDropExampleScreen}
        />
        <Stack.Screen
          name="AlignmentOffsetExample"
          component={AlignmentOffsetExampleScreen}
        />
        <Stack.Screen
          name="AnimationExample"
          component={AnimationExampleScreen}
        />
        <Stack.Screen
          name="DragHandlesExample"
          component={DragHandlesExampleScreen}
        />
        <Stack.Screen
          name="ActiveStylesExample"
          component={ActiveStylesExampleScreen}
        />
        <Stack.Screen
          name="BoundedDraggingExample"
          component={BoundedDraggingExampleScreen}
        />
        <Stack.Screen
          name="XAxisConstrainedExample"
          component={XAxisConstrainedExampleScreen}
        />
        <Stack.Screen
          name="YAxisConstrainedExample"
          component={YAxisConstrainedExampleScreen}
        />
        <Stack.Screen
          name="BoundedYAxisExample"
          component={BoundedYAxisExampleScreen}
        />
        <Stack.Screen
          name="CapacityExample"
          component={CapacityExampleScreen}
        />
        <Stack.Screen
          name="CustomDraggableExample"
          component={CustomDraggableExampleScreen}
        />
        <Stack.Screen
          name="HorizontalSortableExample"
          component={HorizontalSortableExampleScreen}
        />
        <Stack.Screen
          name="GridSortableExample"
          component={GridSortableExampleScreen}
        />
        <Stack.Screen
          name="DynamicHeightExample"
          component={DynamicHeightExampleScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
