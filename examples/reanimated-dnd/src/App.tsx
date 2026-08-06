// App.tsx
//
// PORTED from react-native-reanimated-dnd's own example app (MIT, see
// ../README.md). Upstream's version is Expo's: it loads five font families
// through `expo-font`, holds `expo-splash-screen` open until they arrive,
// and renders an `AnimatedSplashScreen` written in Reanimated over the top.
// None of that survives, and none of it is drag-and-drop:
//
// - `expo`, `expo-font`, `expo-splash-screen` — Expo is not a thing on this
//   platform; `AppRegistry` is (see index.tsx). A desktop app has no splash
//   screen and no bundled font files to wait for.
// - `AnimatedSplashScreen` — Reanimated, which does not run here at all.
// - `LogBox` — no such API; there is no redbox to suppress a warning in.
//
// What DOES survive unedited is the line that matters: the
// `GestureHandlerRootView` import. `react-native-gesture-handler` is not
// installed in this workspace and never resolves — the preset aliases it to
// `react-native-gtkx/gesture-handler`, whose root is implemented faithfully
// and whose every other export throws. That was the last line a ported
// drag-and-drop app had to edit, and it no longer is.
//
// One line was ADDED, and it is the biggest single finding of the port: the
// `<Widget>` around `<AppNavigator />`. This platform's stack navigator
// renders an `Adw.NavigationView`, a real GTK widget, and a GTK widget
// nested inside React Native layout has to be given a box to live in — that
// is what `Widget` is for (docs/architecture/layout-and-styling.md). Without it the
// navigator is allocated nothing and the window is blank, with only
// "Trying to snapshot AdwNavigationView without a current allocation" on
// stderr to say so.
//
// It bites here and not in `examples/hn-app` because hn-app puts
// `<Stack.Navigator>` at the very root of the app tree, where GTK allocates
// it directly. Upstream's App.tsx does not — and neither does upstream's own
// quick start, which wraps everything in `<GestureHandlerRootView>`. So ANY
// app that follows the documented reanimated-dnd shape and uses a stack
// navigator hits this. Recorded in the PR as a gap to close rather than a
// divergence to live with: `createStackNavigator` should bring its own box.
import { Platform, StyleSheet, View } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { Widget } from "react-native-gtkx/common"
import { ToastProvider } from "./components/toast"
import { AppNavigator } from "./navigation/AppNavigator"
import { colors } from "./theme"

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ToastProvider>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={
              Platform.OS === "web" ? styles.webContainer : styles.container
            }
          >
            {/* The one line added to upstream's tree — see the header. */}
            <Widget style={{ flex: 1 }}>
              <AppNavigator />
            </Widget>
          </View>
        </View>
      </ToastProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  webContainer: {
    maxHeight: 750,
    maxWidth: 350,
    height: "100%",
    width: "100%",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 50,
    backgroundColor: colors.bg,
    overflow: "hidden",
    paddingVertical: 12,
    paddingTop: 20,
  },
  container: {
    flex: 1,
    height: "100%",
    width: "100%",
    backgroundColor: colors.bg,
  },
})
