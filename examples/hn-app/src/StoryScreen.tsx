// Story screen: back header, the story card (favicon, meta, "Open in
// browser" or the Ask HN text) and a lazily loaded comment tree — every
// comment is a separate /item/<id> request fired when its node mounts.
import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  backButton: {
    backgroundColor: palette.card,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  backButtonText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  headerTitle: {
    flex: 1,
    color: palette.textDim,
    fontSize: 13,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    alignItems: "stretch",
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
          style={styles.showReplies}
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

export const StoryScreen = ({
  story,
  onBack,
}: {
  story: Story
  onBack: () => void
}) => {
  const domain = extractDomain(story.url)
  // GTK has no ICO decoder, so real /favicon.ico files fire onError (see
  // docs/api.md) — Google's s2 endpoint serves PNG for any domain instead,
  // and onError hides the image for domains it cannot resolve either.
  const [faviconFailed, setFaviconFailed] = useState(false)
  const url = story.url
  const kids = story.kids ?? []

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>
          {formatComments(story.descendants)}
        </Text>
      </View>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
      >
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
              style={styles.openButton}
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
          {kids.length === 0 ? "No comments yet" : "Comments"}
        </Text>
        {kids.map((kid) => (
          <Comment
            key={kid}
            id={kid}
            depth={0}
            autoLimit={AUTO_DEPTH}
          />
        ))}
      </ScrollView>
    </View>
  )
}
