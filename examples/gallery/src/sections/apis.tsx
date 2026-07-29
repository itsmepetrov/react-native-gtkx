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
  const [alertResult, setAlertResult] = useState("(ещё не вызывали)")
  const [canOpen, setCanOpen] = useState("(нажмите кнопку)")

  const screen = Dimensions.get("screen")

  return (
    <Section
      title="APIs"
      subtitle="Значения и живые хуки платформенных модулей + диалоги Alert и открытие ссылок через портал."
    >
      <DemoCard
        title="Platform"
        hint="OS всегда linux; Version — версия GTK рантайма; select предпочитает ключ linux → native → default"
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
              linux: "ветка linux",
              default: "ветка default",
            }) ?? "(undefined)"
          }
        />
      </DemoCard>

      <DemoCard
        title="useWindowDimensions (live) и Dimensions"
        hint="ресайзните окно — window-значения обновляются через useSyncExternalStore"
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
        title="useColorScheme и AppState"
        hint="схема приходит от AdwStyleManager и обновляется при смене темы системы"
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
        hint="варианты: одна кнопка OK; две с cancel/destructive; три с isPreferred; результат — ниже"
      >
        <View style={styles.buttonRow}>
          <Button
            label="OK"
            onPress={() =>
              Alert.alert("Простой алерт", "Одна кнопка OK по умолчанию", [
                { text: "OK", onPress: () => setAlertResult("OK") },
              ])
            }
          />
          <Button
            label="cancel / destructive"
            onPress={() =>
              Alert.alert("Удалить файл?", "Действие необратимо.", [
                {
                  text: "Отмена",
                  style: "cancel",
                  onPress: () => setAlertResult("Отмена"),
                },
                {
                  text: "Удалить",
                  style: "destructive",
                  onPress: () => setAlertResult("Удалить"),
                },
              ])
            }
          />
          <Button
            label="три кнопки + isPreferred"
            onPress={() =>
              Alert.alert(
                "Сохранить изменения?",
                undefined,
                [
                  {
                    text: "Не сохранять",
                    style: "destructive",
                    onPress: () => setAlertResult("Не сохранять"),
                  },
                  {
                    text: "Отмена",
                    style: "cancel",
                    onPress: () => setAlertResult("Отмена"),
                  },
                  {
                    text: "Сохранить",
                    isPreferred: true,
                    onPress: () => setAlertResult("Сохранить"),
                  },
                ],
                { onDismiss: () => setAlertResult("(закрыт без кнопки)") },
              )
            }
          />
        </View>
        <Text style={styles.result}>нажато: {alertResult}</Text>
      </DemoCard>

      <DemoCard
        title="Linking"
        hint="openURL уходит в портал (браузер по умолчанию); canOpenURL — статический ответ по схеме"
      >
        <View style={styles.buttonRow}>
          <Button
            label="открыть https://www.gtk.org"
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
                .catch(() => setCanOpen("mailto: ошибка"))
            }}
          />
          <Button
            label='canOpenURL("tg://…")'
            onPress={() => {
              Linking.canOpenURL("tg://resolve")
                .then((ok) => setCanOpen(`tg: ${ok}`))
                .catch(() => setCanOpen("tg: ошибка"))
            }}
          />
        </View>
        <Text style={styles.result}>canOpenURL: {canOpen}</Text>
        <Caption>
          Alert и Linking асинхронны и fire-and-forget — как в react-native.
        </Caption>
      </DemoCard>
    </Section>
  )
}
