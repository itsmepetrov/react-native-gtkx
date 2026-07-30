// Hacker News reader — top stories as a FlatList of cards; tapping a card
// opens the story screen. Everything here is plain React Native; on linux it
// renders as native GTK4/Adwaita widgets and the data layer (src/api.ts) is
// just Node fetch.
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  Appearance,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { fetchTopStories, type Story } from "./api"
import { extractDomain, formatAge, formatComments, formatScore } from "./format"
import { StoryScreen } from "./StoryScreen"
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "700",
  },
  headerSubtitle: {
    flex: 1,
    color: palette.textDim,
    fontSize: 12,
  },
  refreshButton: {
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  refreshButtonText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  list: {
    flex: 1,
  },
  listContent: {
    // ScrollView content defaults to flex-start on this platform — stretch
    // makes the cards fill the full width of the list (see examples/gallery).
    alignItems: "stretch",
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  // The story screen paints over the list instead of replacing it: the
  // FlatList stays mounted underneath, so its scroll offset and loaded
  // pages survive the round trip (unmounting would reset both).
  storyOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.window,
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
      style={styles.card}
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

export const App = () => {
  const [stories, setStories] = useState<Story[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [endReached, setEndReached] = useState(false)
  // State-based navigation: null = the list, a story = the story screen
  // painted over it. Deliberately no navigation library.
  const [openStory, setOpenStory] = useState<Story | null>(null)
  const listRef = useRef<FlatList<Story>>(null)
  // The page the NEXT load-more call should fetch; a ref so a stale
  // onEndReached burst cannot schedule the same page twice.
  const nextPage = useRef(1)
  // Any in-flight request; refresh supersedes pagination, so responses
  // carry a generation stamp and stale ones are dropped.
  const generation = useRef(0)
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (busy.current) {
      return
    }
    busy.current = true
    const current = (generation.current += 1)
    setRefreshing(true)
    setError(null)
    try {
      const first = await fetchTopStories(0)
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
      }
      busy.current = false
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (busy.current || endReached || stories.length === 0) {
      return
    }
    busy.current = true
    const current = generation.current
    const page = nextPage.current
    setLoadingMore(true)
    try {
      const next = await fetchTopStories(page)
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
    const kickoff = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(kickoff)
  }, [refresh])

  // Headless-proof hook for scripts/run-linux-headless-hnapp.sh — dev only.
  // With HN_APP_PROOF=1 the app drives itself through the screenshot
  // sequence (no input devices under headless sway): scroll the list, open
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
      stories[0]
    // Deliberately no cleanup: pagination (onEndReached fires on load and on
    // the scripted scroll) changes `stories` seconds into the sequence, and
    // a cleanup would cancel the pending timers. The app never unmounts.
    setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 800, animated: false })
      proofMark("scrolled")
    }, 2000)
    setTimeout(() => {
      setOpenStory(story)
      proofMark("story-open")
    }, 10000)
    setTimeout(() => {
      setOpenStory(null)
      proofMark("back")
    }, 45000)
  }, [stories])

  if (error !== null) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.errorTitle}>{"Couldn't load stories"}</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Pressable
          style={styles.refreshButton}
          onPress={() => void refresh()}
        >
          <Text style={styles.refreshButtonText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Hacker News</Text>
        <Text style={styles.headerSubtitle}>top stories</Text>
        <Pressable
          style={styles.refreshButton}
          onPress={() => void refresh()}
        >
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </Pressable>
      </View>
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
            onPress={() => setOpenStory(item)}
          />
        )}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          refreshing ? null : (
            <View style={styles.footer}>
              <Text style={styles.footerText}>No stories yet</Text>
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
      {openStory !== null && (
        <View style={styles.storyOverlay}>
          <StoryScreen
            story={openStory}
            onBack={() => setOpenStory(null)}
          />
        </View>
      )}
    </View>
  )
}
