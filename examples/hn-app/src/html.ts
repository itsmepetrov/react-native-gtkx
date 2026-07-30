// HN item HTML → plain text for <Text>. The API serves a small HTML subset
// (entities, <p> separators, <a href> links, <i>/<b>/<code>/<pre>); there is
// no DOM on this platform, so a tiny scanner flattens it here. Pure module —
// runs under plain Node in the unit suite.

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

// "&#38;" / "&#x27;" / "&amp;" → their characters. Unknown names and invalid
// code points pass through untouched; each entity is decoded exactly once
// ("&amp;amp;" stays "&amp;").
export const decodeEntities = (text: string): string =>
  text.replace(
    /&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, body: string) => {
      if (body.startsWith("#")) {
        const hex = body[1] === "x" || body[1] === "X"
        const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
        if (Number.isNaN(code) || code > 0x10ffff) {
          return match
        }
        return String.fromCodePoint(code)
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match
    },
  )

// Splitting on the capture keeps tags as their own tokens between the text.
const TAG_TOKEN = /(<[^>]*>)/
const TAG_NAME = /^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/
const HREF = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i

export const htmlToText = (html: string): string => {
  const parts: string[] = []
  // Inside <a href>…</a> the visible text is HN's ellipsised link — the href
  // is the text worth showing in a reader, so anchor bodies are skipped.
  let anchorDepth = 0
  for (const token of html.split(TAG_TOKEN)) {
    if (token === "") {
      continue
    }
    if (token.startsWith("<")) {
      const name = TAG_NAME.exec(token)?.[1]?.toLowerCase()
      if (name === "a") {
        if (token.startsWith("</")) {
          anchorDepth = Math.max(0, anchorDepth - 1)
        } else {
          const href = HREF.exec(token)
          const url = href?.[1] ?? href?.[2] ?? href?.[3]
          if (url !== undefined) {
            parts.push(decodeEntities(url))
            anchorDepth += 1
          }
          // An <a> without href keeps its inner text like any unknown tag.
        }
      } else if (name === "p") {
        // HN separates paragraphs with bare <p>; well-formed </p><p> pairs
        // produce extra breaks that the collapse below dedupes.
        parts.push("\n\n")
      } else if (name === "br") {
        parts.push("\n")
      }
      // Every other tag — <i>, <b>, <code>, <pre>, anything unknown — is
      // dropped; its inner text (including newlines inside <pre>) stays.
      continue
    }
    if (anchorDepth === 0) {
      parts.push(decodeEntities(token))
    }
  }
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
