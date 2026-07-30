// Story screen: the story card (favicon, meta, "Open in browser" or the
// Ask HN text) and a lazily loaded comment tree — every comment is a
// separate /item/<id> request fired when its node mounts. Back lives in
// the navigator's HeaderBar; StoryRoute adapts the react-navigation route
// (a story object from the list, or a bare id from a deep link).
import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Image,
  InteractionManager,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { fetchItem, type Item, type Story } from "./api"
import { extractDomain, formatAge, formatComments, formatScore } from "./format"
import { htmlToText } from "./html"
import { palette } from "./theme"

// Reply depth rendered without interaction. A "Show replies" press reveals
// this many further levels below the pressed comment (and so on).
const AUTO_DEPTH = 3

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.window,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    alignItems: "stretch",
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  storyCard: {
    backgroundColor: palette.card,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  storyTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  domainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  favicon: {
    width: 16,
    height: 16,
  },
  domain: {
    color: palette.accent,
    fontSize: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  score: {
    color: palette.orange,
    fontSize: 12,
    fontWeight: "700",
  },
  meta: {
    color: palette.textDim,
    fontSize: 12,
  },
  openButton: {
    alignSelf: "flex-start",
    backgroundColor: palette.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  openButtonHovered: {
    backgroundColor: palette.accentHover,
  },
  openButtonText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  storyText: {
    color: palette.text,
    fontSize: 13,
  },
  commentsHeading: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 6,
  },
  commentLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  comment: {
    paddingVertical: 6,
    gap: 4,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  commentAuthor: {
    color: palette.orange,
    fontSize: 12,
    fontWeight: "700",
  },
  commentText: {
    color: palette.text,
    fontSize: 13,
  },
  commentTombstone: {
    color: palette.textDim,
    fontSize: 13,
    fontStyle: "italic",
  },
  // Each reply level nests inside this: the accumulated margins produce the
  // indentation, the left border draws the thread line.
  replies: {
    marginLeft: 6,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: palette.cardAlt,
  },
  showReplies: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  showRepliesHovered: {
    backgroundColor: palette.cardAlt,
  },
  showRepliesText: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  footnote: {
    color: palette.textDim,
    fontSize: 12,
    paddingVertical: 8,
  },
})

type CommentProps = {
  id: number
  // Depth of this comment (top level = 0) — only used against autoLimit.
  depth: number
  // Children render automatically while their depth stays below this;
  // beyond it they hide behind a "Show replies" button.
  autoLimit: number
}

const Comment = ({ id, depth, autoLimit }: CommentProps) => {
  // undefined = still loading; null = the API had nothing for this id.
  const [item, setItem] = useState<Item | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchItem(id)
      .then((fetched) => {
        if (!cancelled) {
          setItem(fetched)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (failed) {
    return <Text style={styles.footnote}>Couldn&apos;t load a comment</Text>
  }
  if (item === undefined) {
    return (
      <View style={styles.commentLoading}>
        <ActivityIndicator />
        <Text style={styles.footnote}>Loading…</Text>
      </View>
    )
  }
  if (item === null) {
    return null
  }

  const tombstone = item.deleted === true || item.dead === true
  const kids = item.kids ?? []
  if (tombstone && kids.length === 0) {
    return null
  }

  const childDepth = depth + 1
  const childrenVisible =
    kids.length > 0 && (childDepth < autoLimit || expanded)
  // Expanding restarts the automatic budget below the pressed comment.
  const childLimit = expanded ? childDepth + AUTO_DEPTH : autoLimit

  return (
    <View style={styles.comment}>
      {tombstone ? (
        <Text style={styles.commentTombstone}>[deleted]</Text>
      ) : (
        <>
          <View style={styles.commentHeader}>
            <Text style={styles.commentAuthor}>{item.by ?? "unknown"}</Text>
            <Text style={styles.meta}>{formatAge(item.time)}</Text>
          </View>
          {item.text !== undefined && (
            <Text style={styles.commentText}>{htmlToText(item.text)}</Text>
          )}
        </>
      )}
      {childrenVisible ? (
        <View style={styles.replies}>
          {kids.map((kid) => (
            <Comment
              key={kid}
              id={kid}
              depth={childDepth}
              autoLimit={childLimit}
            />
          ))}
        </View>
      ) : kids.length > 0 ? (
        <Pressable
          style={({ hovered, pressed }) => [
            styles.showReplies,
            (hovered || pressed) && styles.showRepliesHovered,
          ]}
          onPress={() => setExpanded(true)}
        >
          <Text style={styles.showRepliesText}>
            {kids.length === 1 ? "Show 1 reply" : `Show ${kids.length} replies`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export const StoryScreen = ({ story }: { story: Story }) => {
  // The comment tree starts fetching (and re-rendering) the moment it
  // mounts — mid-push that competes with the slide animation for frames.
  // runAfterInteractions holds it until the navigator's push transition
  // finishes; the story card renders instantly regardless.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const interaction = InteractionManager.runAfterInteractions(() => {
      setSettled(true)
    })
    return () => interaction.cancel()
  }, [])
  const domain = extractDomain(story.url)
  // GTK has no ICO decoder, so real /favicon.ico files fire onError (see
  // docs/api.md) — Google's s2 endpoint serves PNG for any domain instead,
  // and onError hides the image for domains it cannot resolve either.
  const [faviconFailed, setFaviconFailed] = useState(false)
  const url = story.url
  const kids = story.kids ?? []

  // Top-level comments render through a FlatList: each node fetches itself
  // on mount, so virtualization means only the comments near the viewport
  // hit the API — a 300-comment story no longer fires 300 requests at once,
  // it fetches as you scroll. The story card rides along as the header.
  const header = (
    <View>
      <View style={styles.storyCard}>
        <Text style={styles.storyTitle}>{story.title}</Text>
        {domain !== "" && (
          <View style={styles.domainRow}>
            {!faviconFailed && (
              <Image
                style={styles.favicon}
                source={{
                  uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
                }}
                onError={() => setFaviconFailed(true)}
              />
            )}
            <Text style={styles.domain}>{domain}</Text>
          </View>
        )}
        <View style={styles.metaRow}>
          {story.score !== undefined && (
            <Text style={styles.score}>{formatScore(story.score)}</Text>
          )}
          {story.by !== undefined && (
            <Text style={styles.meta}>{`by ${story.by}`}</Text>
          )}
          <Text style={styles.meta}>{formatAge(story.time)}</Text>
        </View>
        {url !== undefined ? (
          <Pressable
            style={({ hovered, pressed }) => [
              styles.openButton,
              (hovered || pressed) && styles.openButtonHovered,
            ]}
            onPress={() => void Linking.openURL(url)}
          >
            <Text style={styles.openButtonText}>Open in browser</Text>
          </Pressable>
        ) : story.text !== undefined ? (
          // Ask HN and similar self posts have no url — show the post
          // body (HTML flattened to text) where the button would be.
          <Text style={styles.storyText}>{htmlToText(story.text)}</Text>
        ) : null}
      </View>
      <Text style={styles.commentsHeading}>
        {kids.length === 0
          ? "No comments yet"
          : `Comments — ${formatComments(story.descendants)}`}
      </Text>
      {!settled && kids.length > 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : null}
    </View>
  )

  return (
    <View style={styles.screen}>
      <FlatList
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        data={settled ? kids : []}
        keyExtractor={(kid) => String(kid)}
        renderItem={({ item }) => (
          <Comment
            id={item}
            depth={0}
            autoLimit={AUTO_DEPTH}
          />
        )}
        ListHeaderComponent={header}
      />
    </View>
  )
}

export type StoryParams = { story: Story } | { id: number }

// The route component: a pushed card carries the full story object; a deep
// link (hn-gtkx://story/<id>) carries only the id and the story is fetched.
export const StoryRoute = ({ route }: { route: { params?: StoryParams } }) => {
  const params = route.params
  const paramStory =
    params !== undefined && "story" in params ? params.story : null
  const paramId = params !== undefined && "id" in params ? params.id : null
  const [fetched, setFetched] = useState<Story | null>(null)

  useEffect(() => {
    if (paramStory !== null || paramId === null) {
      return
    }
    let stale = false
    void fetchItem(paramId).then((item) => {
      if (!stale && item !== null && item.title !== undefined) {
        setFetched(item as Story)
      }
    })
    return () => {
      stale = true
    }
  }, [paramStory, paramId])

  const story = paramStory ?? fetched
  if (story === null) {
    return (
      <View style={[styles.screen, styles.loading]}>
        <ActivityIndicator />
      </View>
    )
  }
  return <StoryScreen story={story} />
}
