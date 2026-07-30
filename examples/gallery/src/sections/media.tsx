// Image → GtkPicture: four resizeMode values over a local SVG from the
// Adwaita theme, remote http(s) sources through the disk cache, and onError
// on a nonexistent path / dead URL.
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
  const [error, setError] = useState("(no error)")
  const [remote, setRemote] = useState("loading…")
  const [remoteError, setRemoteError] = useState("(no error)")

  return (
    <Section
      title="Media"
      subtitle="Image renders local files and http(s) sources (Node fetch → disk cache) via GtkPicture; the style sets the size, the resizeMode prop sets contentFit."
    >
      <DemoCard
        title="resizeMode"
        hint="the same Adwaita icon in a 110×64 frame: cover / contain / stretch / center"
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
        hint="source as a plain string (no { uri }); the callback confirms the file was found and assigned to the widget"
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
            onLoad: {loaded ? "fired" : "not yet"}
          </Text>
        </View>
      </DemoCard>

      <DemoCard
        title="remote images"
        hint="an https source downloads with Node fetch into the disk cache — repeat renders of the same URL are instant, no network; a dead URL fires onError"
      >
        <View style={styles.row}>
          <View style={styles.item}>
            <View style={styles.frame}>
              <Image
                source={{
                  uri: "https://icons.duckduckgo.com/ip3/news.ycombinator.com.ico",
                }}
                resizeMode="contain"
                style={styles.image}
                onLoad={() => setRemote("onLoad fired (cached on disk)")}
                onError={({ nativeEvent }) => setRemote(nativeEvent.error)}
              />
            </View>
            <Text style={styles.status}>{remote}</Text>
          </View>
          <View style={styles.item}>
            <View style={styles.frame}>
              <Image
                source={{ uri: "https://127.0.0.1:1/broken.png" }}
                style={styles.image}
                onError={({ nativeEvent }) =>
                  setRemoteError(nativeEvent.error.slice(0, 60))
                }
              />
            </View>
            <Text style={styles.errorText}>{remoteError}</Text>
          </View>
        </View>
      </DemoCard>

      <DemoCard
        title="onError"
        hint="the path does not exist → onError with the error text, the widget stays empty"
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
