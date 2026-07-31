// The proof that react-native-gtkx/adwaita stands on its own: a real
// Adw.NavigationView stack, with NO react-navigation anywhere in this app.
// The "router" here is a useState holding an array of tags. Swap it for your
// own router, a reducer, a URL — the primitive does not care.
//
// What this demo exercises, top to bottom:
//   - declarative stack: change the array, the widget animates;
//   - native pops: the Adwaita back button, Escape and the back gesture all
//     report through onPopped, and the app follows in its own state;
//   - React Native content inside a page (PageContent);
//   - React Native content inside an AdwHeaderBar slot (IntrinsicContent);
//   - a raw GTK widget in the header, because nothing is filtered;
//   - the escape hatch: a ref to the Adw.NavigationView itself.
import { useRef, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import {
  Adw,
  AdwHeaderBar,
  AdwNavigationPage,
  AdwNavigationStack,
  AdwToolbarView,
  GtkButton,
  GtkEntry,
  IntrinsicContent,
  PageContent,
} from "react-native-gtkx/adwaita"

const ARTICLES = [
  { tag: "wayland", title: "Wayland", body: "The display protocol." },
  { tag: "gtk", title: "GTK 4", body: "The widget toolkit." },
  { tag: "adwaita", title: "libadwaita", body: "The GNOME design system." },
]

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 8 },
  row: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  rowHovered: { backgroundColor: "rgb(0 0 0 / 0.06)" },
  title: { fontSize: 16, fontWeight: "600" },
  body: { fontSize: 14, opacity: 0.7 },
  counter: { fontSize: 13, opacity: 0.6 },
  toolbar: { flexDirection: "row", gap: 8, alignItems: "center" },
  gtkButton: { width: 72, backgroundColor: "#3584e4", borderRadius: 6 },
})

const App = () => {
  // This IS the navigation state. One array of tags, nothing else.
  const [stack, setStack] = useState<string[]>(["index"])
  const viewRef = useRef<Adw.NavigationView | null>(null)

  const push = (tag: string) => setStack((current) => [...current, tag])
  const popTo = (tag: string) =>
    setStack((current) => current.slice(0, current.indexOf(tag) + 1))

  return (
    <AdwNavigationStack
      ref={viewRef}
      stack={stack}
      // The widget popped by itself: the back button, Escape, the back
      // gesture or the back-history menu. Drop the tag and stay in sync.
      onPopped={(tag) =>
        setStack((current) => current.filter((entry) => entry !== tag))
      }
    >
      <AdwNavigationPage
        tag="index"
        title="Articles"
      >
        <AdwToolbarView
          topBar={
            <AdwHeaderBar
              // React Native content living inside native chrome: its own
              // Yoga size becomes the slot size.
              start={
                <IntrinsicContent>
                  <Text style={styles.counter}>{stack.length} deep</Text>
                </IntrinsicContent>
              }
              // …and a raw GTK widget right next to it, unwrapped, with every
              // property gtkx binds available.
              end={[
                <GtkButton
                  key="home"
                  iconName="go-home-symbolic"
                  tooltipText="Back to the root"
                  onClicked={() => popTo("index")}
                />,
              ]}
            />
          }
        >
          <PageContent>
            <View style={styles.screen}>
              {/* GTK widgets laid out BY React Native: the entry flexes, the
                  button takes a width and a colour, both from `style`. */}
              <View style={styles.toolbar}>
                <GtkEntry
                  style={{ flex: 1 }}
                  placeholderText="Filter"
                />
                <GtkButton
                  style={styles.gtkButton}
                  label="Go"
                />
              </View>
              {ARTICLES.map((article) => (
                <Pressable
                  key={article.tag}
                  style={({ hovered }) => [
                    styles.row,
                    hovered && styles.rowHovered,
                  ]}
                  onPress={() => push(article.tag)}
                >
                  <Text style={styles.title}>{article.title}</Text>
                  <Text style={styles.body}>{article.body}</Text>
                </Pressable>
              ))}
            </View>
          </PageContent>
        </AdwToolbarView>
      </AdwNavigationPage>

      {ARTICLES.map((article) => (
        <AdwNavigationPage
          key={article.tag}
          tag={article.tag}
          title={article.title}
        >
          <AdwToolbarView topBar={<AdwHeaderBar />}>
            <PageContent>
              <View style={styles.screen}>
                <Text style={styles.body}>{article.body}</Text>
                <Pressable
                  style={styles.row}
                  onPress={() => push("about")}
                >
                  <Text style={styles.title}>Push one more</Text>
                </Pressable>
              </View>
            </PageContent>
          </AdwToolbarView>
        </AdwNavigationPage>
      ))}

      <AdwNavigationPage
        tag="about"
        title="Deeper"
      >
        <AdwToolbarView topBar={<AdwHeaderBar />}>
          <PageContent>
            <View style={styles.screen}>
              <Text style={styles.body}>
                Three levels deep, no router involved. Press Escape or use the
                back gesture: the widget pops and the app follows.
              </Text>
            </View>
          </PageContent>
        </AdwToolbarView>
      </AdwNavigationPage>
    </AdwNavigationStack>
  )
}

export default App
