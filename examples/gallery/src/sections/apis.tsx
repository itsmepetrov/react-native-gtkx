// API modules: Platform, Dimensions/useWindowDimensions (live),
// useColorScheme, AppState, Alert with button variants, Linking.
import { useState } from "react"
import {
  Alert,
  AppState,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

const styles = StyleSheet.create({
  kvRow: {
    flexDirection: "row",
    gap: 8,
  },
  key: {
    color: palette.textFaint,
    fontSize: 13,
    width: 220,
  },
  value: {
    color: "#8ff0a4",
    fontSize: 13,
    fontFamily: "Monospace",
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: palette.accentPressed,
  },
  buttonText: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  result: {
    color: palette.textDim,
    fontSize: 12,
  },
})

const KV = ({ k, v }: { k: string; v: string }) => (
  <View style={styles.kvRow}>
    <Text style={styles.key}>{k}</Text>
    <Text style={styles.value}>{v}</Text>
  </View>
)

const Button = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable
    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    onPress={onPress}
  >
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>
)

export const ApisSection = () => {
  const window = useWindowDimensions()
  const scheme = useColorScheme()
  const [alertResult, setAlertResult] = useState("(not called yet)")
  const [canOpen, setCanOpen] = useState("(press a button)")

  const screen = Dimensions.get("screen")

  return (
    <Section
      title="APIs"
      subtitle="Platform module values and live hooks, plus Alert dialogs and link opening through the portal."
    >
      <DemoCard
        title="Platform"
        hint="OS is always linux; Version is the GTK runtime version; select prefers the linux → native → default key"
      >
        <KV
          k="Platform.OS"
          v={Platform.OS}
        />
        <KV
          k="Platform.Version (GTK)"
          v={Platform.Version}
        />
        <KV
          k="Platform.isTV"
          v={String(Platform.isTV)}
        />
        <KV
          k="Platform.isTesting"
          v={String(Platform.isTesting)}
        />
        <KV
          k="Platform.select({ linux, default })"
          v={
            Platform.select({
              linux: "linux branch",
              default: "default branch",
            }) ?? "(undefined)"
          }
        />
      </DemoCard>

      <DemoCard
        title="useWindowDimensions (live) and Dimensions"
        hint="resize the window — the window values update via useSyncExternalStore"
      >
        <KV
          k="window.width × height"
          v={`${Math.round(window.width)} × ${Math.round(window.height)}`}
        />
        <KV
          k="window.scale / fontScale"
          v={`${window.scale} / ${window.fontScale}`}
        />
        <KV
          k='Dimensions.get("screen")'
          v={`${Math.round(screen.width)} × ${Math.round(screen.height)}`}
        />
      </DemoCard>

      <DemoCard
        title="useColorScheme and AppState"
        hint="the scheme comes from AdwStyleManager and updates when the system theme changes"
      >
        <KV
          k="useColorScheme()"
          v={scheme ?? "(null)"}
        />
        <KV
          k="AppState.currentState"
          v={AppState.currentState}
        />
      </DemoCard>

      <DemoCard
        title="Alert.alert"
        hint="variants: a single OK button; two with cancel/destructive; three with isPreferred; the result is below"
      >
        <View style={styles.buttonRow}>
          <Button
            label="OK"
            onPress={() =>
              Alert.alert("Simple alert", "A single default OK button", [
                { text: "OK", onPress: () => setAlertResult("OK") },
              ])
            }
          />
          <Button
            label="cancel / destructive"
            onPress={() =>
              Alert.alert("Delete file?", "This action cannot be undone.", [
                {
                  text: "Cancel",
                  style: "cancel",
                  onPress: () => setAlertResult("Cancel"),
                },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => setAlertResult("Delete"),
                },
              ])
            }
          />
          <Button
            label="three buttons + isPreferred"
            onPress={() =>
              Alert.alert(
                "Save changes?",
                undefined,
                [
                  {
                    text: "Don't save",
                    style: "destructive",
                    onPress: () => setAlertResult("Don't save"),
                  },
                  {
                    text: "Cancel",
                    style: "cancel",
                    onPress: () => setAlertResult("Cancel"),
                  },
                  {
                    text: "Save",
                    isPreferred: true,
                    onPress: () => setAlertResult("Save"),
                  },
                ],
                {
                  onDismiss: () =>
                    setAlertResult("(dismissed without a button)"),
                },
              )
            }
          />
        </View>
        <Text style={styles.result}>pressed: {alertResult}</Text>
      </DemoCard>

      <DemoCard
        title="Linking"
        hint="openURL goes through the portal (default browser); canOpenURL is a static answer based on the scheme"
      >
        <View style={styles.buttonRow}>
          <Button
            label="open https://www.gtk.org"
            onPress={() => {
              Linking.openURL("https://www.gtk.org").catch((error: unknown) => {
                console.error("openURL failed:", error)
              })
            }}
          />
          <Button
            label='canOpenURL("mailto:…")'
            onPress={() => {
              Linking.canOpenURL("mailto:hi@example.org")
                .then((ok) => setCanOpen(`mailto: ${ok}`))
                .catch(() => setCanOpen("mailto: error"))
            }}
          />
          <Button
            label='canOpenURL("tg://…")'
            onPress={() => {
              Linking.canOpenURL("tg://resolve")
                .then((ok) => setCanOpen(`tg: ${ok}`))
                .catch(() => setCanOpen("tg: error"))
            }}
          />
        </View>
        <Text style={styles.result}>canOpenURL: {canOpen}</Text>
        <Caption>
          Alert and Linking are async and fire-and-forget — just like in
          react-native.
        </Caption>
      </DemoCard>
    </Section>
  )
}
