// Hacker News reader — top stories as a FlatList of cards; tapping a card
// pushes the story screen on a real Adwaita navigation stack
// (react-native-gtkx/navigation): the HeaderBar back button and the list
// state surviving the round trip come from the navigator — pages below the
// stack top stay mounted. Everything else is plain React Native; the data
// layer (src/api.ts) is just Node fetch.
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Appearance,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import {
  createStackNavigator,
  NavigationContainer,
  type StackScreenProps,
} from "react-native-gtkx/navigation"
import { fetchTopStories, searchStories, type Story } from "./api"
import { extractDomain, formatAge, formatComments, formatScore } from "./format"
import { StoryRoute, type StoryParams } from "./StoryScreen"
import { palette } from "./theme"

// Force the dark Adwaita look.
Appearance.setColorScheme("dark")

// Stage markers for the headless-proof hook below; the headless script greps
// them out of the host log to pace its screenshots.
const proofMark = (stage: string) => {
  // eslint-disable-next-line no-console -- deliberate script-facing output
  console.log(`HN_APP_PROOF ${stage}`)
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.window,
  },
  list: {
    flex: 1,
  },
  listContent: {
    // ScrollView content defaults to flex-start on this platform — stretch
    // makes the cards fill the full width of the list (see examples/gallery).
    alignItems: "stretch",
    paddingTop: 10,
    paddingBottom: 6,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 14,
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  cardHovered: {
    backgroundColor: palette.cardAlt,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  cardRank: {
    color: palette.textDim,
    fontSize: 13,
    minWidth: 24,
  },
  cardTitle: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
  },
  cardDomain: {
    color: palette.accent,
    fontSize: 12,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 32,
  },
  cardScore: {
    color: palette.orange,
    fontSize: 12,
    fontWeight: "700",
  },
  cardMeta: {
    color: palette.textDim,
    fontSize: 12,
  },
  footer: {
    alignItems: "center",
    padding: 12,
  },
  footerText: {
    color: palette.textDim,
    fontSize: 12,
  },
  // Lives in the HeaderBar via headerRight — an intrinsic-size RN root:
  // the input's Yoga size IS the chrome slot size.
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  searchInput: {
    width: 190,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonHovered: {
    backgroundColor: palette.cardAlt,
  },
  clearButtonText: {
    color: palette.textDim,
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  retryButton: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  retryButtonHovered: {
    backgroundColor: palette.accentHover,
  },
  retryButtonText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  errorTitle: {
    color: palette.red,
    fontSize: 16,
    fontWeight: "700",
  },
  errorMessage: {
    color: palette.textDim,
    fontSize: 13,
    textAlign: "center",
  },
})

const StoryCard = ({
  story,
  rank,
  onPress,
}: {
  story: Story
  rank: number
  onPress: () => void
}) => {
  const domain = extractDomain(story.url)
  return (
    <Pressable
      style={({ hovered, pressed }) => [
        styles.card,
        (hovered || pressed) && styles.cardHovered,
      ]}
      onPress={onPress}
    >
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardRank}>{`${rank}.`}</Text>
        <Text style={styles.cardTitle}>{story.title}</Text>
      </View>
      {domain ? (
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardDomain}>{domain}</Text>
        </View>
      ) : null}
      <View style={styles.cardMetaRow}>
        {story.score !== undefined && (
          <Text style={styles.cardScore}>{formatScore(story.score)}</Text>
        )}
        {story.by !== undefined && (
          <Text style={styles.cardMeta}>{`by ${story.by}`}</Text>
        )}
        <Text style={styles.cardMeta}>{formatAge(story.time)}</Text>
        <Text style={styles.cardMeta}>{formatComments(story.descendants)}</Text>
      </View>
    </Pressable>
  )
}

type RootStackParamList = {
  "Top Stories": undefined
  Story: StoryParams
}

const TopStoriesScreen = ({
  navigation,
}: StackScreenProps<RootStackParamList, "Top Stories">) => {
  const [stories, setStories] = useState<Story[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [endReached, setEndReached] = useState(false)
  // "" = the top-stories feed; anything else is a live API search.
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  // Mirrors activeQuery for rendering (a ref must not be read during render).
  const [loadedQuery, setLoadedQuery] = useState("")
  // The query the loaded list belongs to — a ref so load() can read it
  // without being re-created on every keystroke.
  const activeQuery = useRef("")
  const listRef = useRef<FlatList<Story>>(null)
  // The page the NEXT load-more call should fetch; a ref so a stale
  // onEndReached burst cannot schedule the same page twice.
  const nextPage = useRef(1)
  // Any in-flight request; refresh supersedes pagination, so responses
  // carry a generation stamp and stale ones are dropped.
  const generation = useRef(0)
  const busy = useRef(false)

  // One loader for both sources: the top-stories feed and the search API.
  // A generation stamp drops responses whose request was superseded (a new
  // keystroke, a refresh) — the list never shows results for a stale query.
  const load = useCallback(async (searchQuery: string) => {
    busy.current = true
    const current = (generation.current += 1)
    activeQuery.current = searchQuery
    setLoadedQuery(searchQuery)
    setRefreshing(true)
    setError(null)
    try {
      const first = searchQuery
        ? (await searchStories(searchQuery, 0)).stories
        : await fetchTopStories(0)
      if (generation.current === current) {
        setStories(first)
        nextPage.current = 1
        setEndReached(first.length === 0)
      }
    } catch (cause) {
      if (generation.current === current) {
        setStories([])
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (generation.current === current) {
        setRefreshing(false)
        setSearching(false)
      }
      busy.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (busy.current) {
      return
    }
    await load(activeQuery.current)
  }, [load])

  const loadMore = useCallback(async () => {
    if (busy.current || endReached || stories.length === 0) {
      return
    }
    busy.current = true
    const current = generation.current
    const page = nextPage.current
    setLoadingMore(true)
    try {
      const searchQuery = activeQuery.current
      const next = searchQuery
        ? (await searchStories(searchQuery, page)).stories
        : await fetchTopStories(page)
      if (generation.current === current) {
        nextPage.current = page + 1
        if (next.length === 0) {
          setEndReached(true)
        } else {
          // The snapshot in api.ts already prevents cross-page overlap;
          // the id filter also survives a snapshot replaced mid-scroll.
          setStories((known) => {
            const seen = new Set(known.map((story) => story.id))
            return [...known, ...next.filter((story) => !seen.has(story.id))]
          })
        }
      }
    } catch {
      // Keep the loaded list on pagination failures; scrolling again
      // retries the same page because nextPage was not advanced.
    } finally {
      if (generation.current === current) {
        setLoadingMore(false)
      }
      busy.current = false
    }
  }, [endReached, stories.length])

  useEffect(() => {
    // Deferred a tick: refresh() flips `refreshing` synchronously, which the
    // set-state-in-effect lint rule (rightly) bans straight from the body.
    const kickoff = setTimeout(() => void load(""), 0)
    return () => clearTimeout(kickoff)
  }, [load])

  // Debounced search: typing schedules one request, not one per keystroke.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === activeQuery.current) {
      return
    }
    setSearching(trimmed.length > 0)
    const timer = setTimeout(() => void load(trimmed), 350)
    return () => clearTimeout(timer)
  }, [query, load])

  // The HeaderBar carries a native Refresh button AND an RN search input
  // (headerRight hosts real React Native content in the chrome — the
  // Nautilus pattern).
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search stories"
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <Pressable
              style={({ hovered, pressed }) => [
                styles.clearButton,
                (hovered || pressed) && styles.clearButtonHovered,
              ]}
              onPress={() => setQuery("")}
            >
              <Text style={styles.clearButtonText}>✕</Text>
            </Pressable>
          )}
        </View>
      ),
      headerButtons: [
        {
          id: "refresh",
          icon: "view-refresh-symbolic",
          tooltip: "Refresh the top stories",
          onPress: () => void refresh(),
        },
      ],
    })
  }, [navigation, refresh, query])

  // Headless-proof hook for scripts/run-linux-headless-hnapp.sh — dev only.
  // With HN_APP_PROOF=1 the app drives itself through the screenshot
  // sequence (no input devices under headless sway): scroll the list, push
  // a story with comments, go back. The console markers pace the script's
  // shots; the last shot proves the scroll offset survived the round trip.
  const proofStarted = useRef(false)
  useEffect(() => {
    if (process.env.HN_APP_PROOF !== "1") {
      return
    }
    if (proofStarted.current || stories.length === 0) {
      return
    }
    proofStarted.current = true
    const story =
      stories.find((candidate) => (candidate.descendants ?? 0) >= 10) ??
      stories[0]!
    // Deliberately no cleanup: pagination (onEndReached fires on load and on
    // the scripted scroll) changes `stories` seconds into the sequence, and
    // a cleanup would cancel the pending timers. The screen never unmounts —
    // it stays at the bottom of the navigation stack.
    setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 800, animated: false })
      proofMark("scrolled")
    }, 2000)
    setTimeout(() => {
      navigation.navigate("Story", { story })
      proofMark("story-open")
    }, 10000)
    setTimeout(() => {
      navigation.goBack()
      proofMark("back")
    }, 45000)
  }, [stories, navigation])

  if (error !== null) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.errorTitle}>{"Couldn't load stories"}</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Pressable
          style={({ hovered, pressed }) => [
            styles.retryButton,
            (hovered || pressed) && styles.retryButtonHovered,
          ]}
          onPress={() => void refresh()}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={stories}
        keyExtractor={(story) => String(story.id)}
        renderItem={({ item, index }) => (
          <StoryCard
            story={item}
            rank={index + 1}
            onPress={() => navigation.navigate("Story", { story: item })}
          />
        )}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        // windowSize is left at the platform default (11 on desktop — more
        // overscan means fewer window-boundary crossings per scrolled pixel);
        // see docs/research/scroll-performance.md before tuning it.
        ListEmptyComponent={
          refreshing || searching ? null : (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {loadedQuery
                  ? `Nothing found for “${loadedQuery}”`
                  : "No stories yet"}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator />
              <Text style={styles.footerText}>Loading more…</Text>
            </View>
          ) : null
        }
      />
    </View>
  )
}

const Stack = createStackNavigator<RootStackParamList>()

// Deep links resolve through react-navigation's linking layer; on desktop
// Linking.getInitialURL is null today, so the config simply proves the
// wiring and picks the default route (see docs/api.md — no "url" events
// fire yet).
const linking = {
  prefixes: ["hn-gtkx://"],
  config: {
    screens: {
      "Top Stories": "",
      Story: "story/:id",
    },
  },
}

export const App = () => (
  <NavigationContainer linking={linking}>
    <Stack.Navigator>
      <Stack.Screen
        name="Top Stories"
        component={TopStoriesScreen}
        options={{ title: "Hacker News" }}
      />
      <Stack.Screen
        name="Story"
        component={StoryRoute}
      />
    </Stack.Navigator>
  </NavigationContainer>
)
