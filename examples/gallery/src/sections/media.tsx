// Image → GtkPicture: four resizeMode values over a local SVG file, remote
// http(s) sources through the disk cache, and onError on a nonexistent
// path / dead URL.
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { useState } from "react"
import { Image, StyleSheet, Text, View } from "react-native"
import { Caption, DemoCard, palette, Section } from "../ui"

// The local file half of the demo used to point at an Adwaita SYMBOLIC icon
// — the only image guaranteed to exist on every Linux box. Symbolic icons
// are a monochrome #2e3436 by design, which is unreadable on a dark card:
// the shot in docs/shots looked like four empty frames. Modern Adwaita
// ships no full-colour images at a stable path at all, so the demo now
// writes its own colourful sample next to the process and loads THAT — the
// mechanism under test (a local file through GtkPicture) is unchanged, and
// the four resizeMode differences are finally visible: 28×20, deliberately
// not the frame's aspect ratio.
const SAMPLE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 20'>" +
  "<rect width='28' height='20' fill='#1c71d8'/>" +
  "<rect y='12' width='28' height='8' fill='#26a269'/>" +
  "<circle cx='21' cy='6.5' r='3.5' fill='#f5c211'/>" +
  "<path d='M0 14 6 8l5 5 4-4 6 5v6H0z' fill='#613583'/>" +
  "</svg>"

const ICON = join(mkdtempSync(join(tmpdir(), "rn-gtkx-gallery-")), "sample.svg")
writeFileSync(ICON, SAMPLE_SVG)

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
    color: palette.error,
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
        hint="the same 28×20 local SVG in a 110×64 frame: cover / contain / stretch / center"
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
                  uri: "https://avatars.githubusercontent.com/u/69631?s=80",
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
