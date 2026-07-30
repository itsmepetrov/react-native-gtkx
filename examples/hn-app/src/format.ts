// Pure presentation helpers for story cards. No react-native imports here —
// these run under plain Node in the unit suite.

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY
const YEAR = 365 * DAY

// HN timestamps are unix seconds; `nowMs` is injectable for tests.
export const formatAge = (timeSeconds: number, nowMs = Date.now()): string => {
  const elapsed = Math.max(0, Math.floor(nowMs / 1000) - timeSeconds)
  if (elapsed < MINUTE) {
    return "just now"
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m ago`
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h ago`
  }
  if (elapsed < MONTH) {
    return `${Math.floor(elapsed / DAY)}d ago`
  }
  if (elapsed < YEAR) {
    return `${Math.floor(elapsed / MONTH)}mo ago`
  }
  return `${Math.floor(elapsed / YEAR)}y ago`
}

// "https://www.example.com/a/b" -> "example.com". Empty string for Ask HN
// style items (no url) and for anything the URL parser rejects.
export const extractDomain = (url?: string): string => {
  if (!url) {
    return ""
  }
  try {
    const { hostname } = new URL(url)
    return hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

// 999 -> "999", 1000 -> "1k", 1234 -> "1.2k" (one decimal, ".0" trimmed).
export const formatCount = (count: number): string => {
  if (count < 1000) {
    return String(count)
  }
  return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`
}

export const formatScore = (score?: number): string => {
  if (score === undefined) {
    return ""
  }
  return score === 1 ? "1 point" : `${formatCount(score)} points`
}

export const formatComments = (count?: number): string => {
  if (count === undefined || count === 0) {
    return "no comments"
  }
  return count === 1 ? "1 comment" : `${formatCount(count)} comments`
}
