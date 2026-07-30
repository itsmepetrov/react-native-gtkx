// Profile demo — written ONLY against the react-native surface. Zero @gtkx/*
// imports: this is the whole point of react-native-gtkx. The same component is
// mounted by the GTK entry (./index.tsx) and by the react-native-web wrapper
// (examples/profile-web) without any source changes.
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native"

const AVATAR_GTK =
  "/usr/share/icons/Adwaita/symbolic/status/weather-clear-symbolic.svg"

// Browsers cannot read the Adwaita icon from disk, so the web build inlines an
// equivalent sun glyph as a data URI. Platform.select over asset sources is
// the standard react-native pattern for exactly this situation.
const AVATAR_WEB =
  "data:image/svg+xml," +
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>" +
  "<circle cx='14' cy='14' r='5.5' fill='none' stroke='%23ffffff' stroke-width='2.5'/>" +
  "<g fill='%23ffffff'><circle cx='24' cy='14' r='1.8'/><circle cx='21.07' cy='21.07' r='1.8'/>" +
  "<circle cx='14' cy='24' r='1.8'/><circle cx='6.93' cy='21.07' r='1.8'/><circle cx='4' cy='14' r='1.8'/>" +
  "<circle cx='6.93' cy='6.93' r='1.8'/><circle cx='14' cy='4' r='1.8'/><circle cx='21.07' cy='6.93' r='1.8'/>" +
  "</g></svg>"

const AVATAR =
  Platform.select({ web: AVATAR_WEB, default: AVATAR_GTK }) ?? AVATAR_GTK

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
    gap: 16,
    backgroundColor: "#241f31",
  },
  header: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    backgroundColor: "#3d3846",
    borderRadius: 12,
    padding: 16,
  },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1c71d8",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 56,
    height: 56,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
  },
  bio: {
    color: "#c0bfbc",
    fontSize: 13,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#613583",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
  },
  statLabel: {
    color: "#dc8add",
    fontSize: 12,
  },
  section: {
    backgroundColor: "#3d3846",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  sectionBody: {
    color: "#c0bfbc",
    fontSize: 13,
    lineHeight: 19,
  },
  clipped: {
    color: "#77767b",
    fontSize: 12,
  },
  footer: {
    marginTop: "auto",
    height: 44,
    borderRadius: 12,
    backgroundColor: "#26a269",
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    color: "#ffffff",
    fontWeight: "700",
  },
})

const Stat = ({ value, label }: { value: string; label: string }) => (
  <View style={styles.statCard}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
)

const App = () => {
  const scheme = useColorScheme()

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.avatarRing}>
          <Image
            source={{ uri: AVATAR }}
            style={styles.avatar}
            resizeMode="contain"
          />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>react-native-gtkx</Text>
          <Text style={styles.bio}>
            React Native components rendered as native GTK4 widgets. Yoga
            computes the flexbox, Pango measures the text, and the same source
            file also renders this card with react-native-web.
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat
          value="30"
          label="RN exports"
        />
        <Stat
          value="2"
          label="toolchains"
        />
        <Stat
          value="372"
          label="tests green"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About this window</Text>
        <Text style={styles.sectionBody}>
          Everything you see is a real GTK widget: the cards are GtkFixed
          containers styled through GTK CSS, the labels are GtkLabel with
          Pango-measured wrapping, and this paragraph wraps exactly where Yoga
          said it would. The current system color scheme is “{scheme}”.
        </Text>
        <Text
          style={styles.clipped}
          numberOfLines={1}
        >
          This long line demonstrates numberOfLines: it is ellipsized after a
          single line no matter how much text follows here, and there is quite a
          lot of it indeed.
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {Platform.select({
            linux: "rendered by react-native-gtkx",
            web: "rendered by react-native-web",
            default: "rendered by react-native",
          })}
        </Text>
      </View>
    </View>
  )
}

export default App
