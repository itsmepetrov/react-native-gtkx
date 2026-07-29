// Image → GtkPicture: four resizeMode values over a local SVG from the
// Adwaita theme + onError on a nonexistent path. v1 limitation: local files
// only (http/https sources are a documented limitation).
import { useState } from "react"
import { Image, StyleSheet, Text, View } from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

// Present in any Linux environment with GTK/Adwaita installed — including
// the visual regression CI container.
const ICON =
  "/usr/share/icons/Adwaita/symbolic/status/weather-clear-symbolic.svg"

const MODES = ["cover", "contain", "stretch", "center"] as const

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 14,
    flexWrap: "wrap",
  },
  item: {
    gap: 4,
    alignItems: "center",
  },
  frame: {
    width: 110,
    height: 64,
    borderRadius: 6,
    backgroundColor: palette.cardAlt,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  status: {
    color: palette.textDim,
    fontSize: 12,
  },
  errorText: {
    color: "#f66151",
    fontSize: 12,
  },
})

export const MediaSection = () => {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState("(ошибки нет)")

  return (
    <Section
      title="Media"
      subtitle="Image рендерит локальные файлы (SVG/PNG/…) через GtkPicture; размер задаёт стиль, contentFit — проп resizeMode. Сеть в v1 не поддерживается."
    >
      <DemoCard
        title="resizeMode"
        hint="одна и та же иконка Adwaita в рамке 110×64: cover / contain / stretch / center"
      >
        <View style={styles.row}>
          {MODES.map((mode) => (
            <View
              key={mode}
              style={styles.item}
            >
              <View style={styles.frame}>
                <Image
                  source={{ uri: ICON }}
                  style={styles.image}
                  resizeMode={mode}
                />
              </View>
              <Caption>{mode}</Caption>
            </View>
          ))}
        </View>
      </DemoCard>

      <DemoCard
        title="onLoad"
        hint="source строкой (без { uri }); колбэк подтверждает, что файл найден и назначен виджету"
      >
        <View style={styles.row}>
          <View style={styles.frame}>
            <Image
              source={ICON}
              style={styles.image}
              resizeMode="contain"
              onLoad={() => setLoaded(true)}
            />
          </View>
          <Text style={styles.status}>
            onLoad: {loaded ? "сработал" : "ещё нет"}
          </Text>
        </View>
      </DemoCard>

      <DemoCard
        title="onError"
        hint="путь не существует → onError с текстом ошибки, виджет остаётся пустым"
      >
        <View style={styles.row}>
          <View style={styles.frame}>
            <Image
              source={{ uri: "/no/such/image.png" }}
              style={styles.image}
              onError={({ nativeEvent }) => setError(nativeEvent.error)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        </View>
      </DemoCard>
    </Section>
  )
}
