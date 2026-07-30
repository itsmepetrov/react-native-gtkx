// @react-navigation/native probe — risk 2 of the navigation epic: does the
// library import and mount on our react-native surface, and exactly which
// RN APIs does it reach for (the stub list for task 002)?
//
// Everything here is the plain RN surface — no @gtkx imports: this is what
// a real app using react-navigation on linux would look like.
import {
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native"
import { AppRegistry, StyleSheet, Text, View } from "react-native"

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#241f31",
  },
  title: { color: "#ffffff", fontSize: 20, fontWeight: "700" },
  meta: { color: "#c0bfbc", fontSize: 13 },
})

const App = () => {
  const navRef = useNavigationContainerRef()
  return (
    <NavigationContainer
      ref={navRef}
      onReady={() => {
        console.log("[rn-probe] NavigationContainer onReady fired")
      }}
    >
      <View style={styles.screen}>
        <Text style={styles.title}>@react-navigation/native mounted</Text>
        <Text style={styles.meta}>
          NavigationContainer renders its children on the linux surface
        </Text>
      </View>
    </NavigationContainer>
  )
}

export const run = (): void => {
  AppRegistry.registerComponent("rnProbe", () => App)
  AppRegistry.runApplication("rnProbe", {
    title: "react-navigation probe",
    width: 640,
    height: 400,
  })
}
