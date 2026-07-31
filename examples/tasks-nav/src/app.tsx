// The window's whole structure — ONE createSidebarNavigator, nothing built
// directly on AdwNavigationSplitView/AdwNavigationPage/AdwActionRow. This is
// the proof the PRD asked for: an app of examples/tasks-app's navigational
// shape (smart views + colored user lists in a sidebar; a content pane that
// shows a task list or an open task's editor), written through the
// navigator instead of around it.
import { NavigationContainer } from "@react-navigation/native"
import { createSidebarNavigator } from "react-native-gtkx/navigation"
import { ContentScreen } from "./screens/content-screen"
import { LIST_COLOR_PALETTE, StoreProvider, useStore } from "./store"

const Sidebar = createSidebarNavigator()

// Route names encode which family a screen belongs to — the shared
// ContentScreen below reads this back apart from any params.
export const smartViewRoute = (view: "all" | "important" | "trash"): string =>
  `smart:${view}`
export const listRoute = (listId: string): string => `list:${listId}`

const AppShell = () => {
  const { lists, tasks, addList } = useStore()

  const openCount = (predicate: (task: (typeof tasks)[number]) => boolean) =>
    tasks.filter((task) => !task.deleted && predicate(task)).length

  const trashCount = tasks.filter((task) => task.deleted).length

  return (
    <NavigationContainer>
      <Sidebar.Navigator
        sidebarTitle="Tasks (nav)"
        collapseWidth={500}
        headerButtons={[
          {
            id: "new-list",
            icon: "list-add-symbolic",
            tooltip: "New List",
            onPress: () => {
              const color =
                LIST_COLOR_PALETTE[lists.length % LIST_COLOR_PALETTE.length]!
              addList(`List ${lists.length + 1}`, color)
            },
          },
        ]}
      >
        <Sidebar.Screen
          name={smartViewRoute("all")}
          component={ContentScreen}
          options={{
            title: "All Tasks",
            icon: "view-list-symbolic",
            count: openCount(() => true),
          }}
        />
        <Sidebar.Screen
          name={smartViewRoute("important")}
          component={ContentScreen}
          options={{
            title: "Important",
            icon: "starred-symbolic",
            count: openCount((task) => task.important),
          }}
        />
        {/* Dynamic: one screen per user list, added/removed as `lists`
            changes at runtime — proves createSidebarNavigator (TabRouter)
            tolerates a changing screen set, not just a fixed tab bar. */}
        {lists.map((list) => (
          <Sidebar.Screen
            key={list.id}
            name={listRoute(list.id)}
            component={ContentScreen}
            options={{
              title: list.name,
              color: list.color,
              count: openCount((task) => task.listId === list.id),
            }}
          />
        ))}
        <Sidebar.Screen
          name={smartViewRoute("trash")}
          component={ContentScreen}
          options={{
            title: "Trash",
            icon: "user-trash-symbolic",
            count: trashCount,
          }}
        />
      </Sidebar.Navigator>
    </NavigationContainer>
  )
}

export const App = () => (
  <StoreProvider>
    <AppShell />
  </StoreProvider>
)
