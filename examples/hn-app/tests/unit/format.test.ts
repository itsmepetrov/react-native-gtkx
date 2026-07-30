import { describe, expect, it } from "vitest"
import {
  extractDomain,
  formatAge,
  formatComments,
  formatCount,
  formatScore,
} from "../../src/format"

// A fixed "now" keeps the age tests deterministic.
const NOW_MS = 1_700_000_000_000
const secondsAgo = (seconds: number) => Math.floor(NOW_MS / 1000) - seconds

describe("formatAge", () => {
  it("reports under a minute as just now", () => {
    expect(formatAge(secondsAgo(0), NOW_MS)).toBe("just now")
    expect(formatAge(secondsAgo(59), NOW_MS)).toBe("just now")
  })

  it("reports minutes, hours and days", () => {
    expect(formatAge(secondsAgo(5 * 60), NOW_MS)).toBe("5m ago")
    expect(formatAge(secondsAgo(3 * 3600), NOW_MS)).toBe("3h ago")
    expect(formatAge(secondsAgo(2 * 86400), NOW_MS)).toBe("2d ago")
  })

  it("rounds down to the largest whole unit", () => {
    expect(formatAge(secondsAgo(119), NOW_MS)).toBe("1m ago")
    expect(formatAge(secondsAgo(23 * 3600 + 3599), NOW_MS)).toBe("23h ago")
  })

  it("reports months and years", () => {
    expect(formatAge(secondsAgo(45 * 86400), NOW_MS)).toBe("1mo ago")
    expect(formatAge(secondsAgo(400 * 86400), NOW_MS)).toBe("1y ago")
  })

  it("clamps timestamps from the future", () => {
    expect(formatAge(secondsAgo(-3600), NOW_MS)).toBe("just now")
  })
})

describe("extractDomain", () => {
  it("extracts the hostname", () => {
    expect(extractDomain("https://example.com/a/b?c=d")).toBe("example.com")
  })

  it("strips a leading www", () => {
    expect(extractDomain("https://www.example.com/story")).toBe("example.com")
  })

  it("keeps other subdomains", () => {
    expect(extractDomain("https://blog.rust-lang.org/2026/post")).toBe(
      "blog.rust-lang.org",
    )
  })

  it("returns an empty string for Ask HN items (no url)", () => {
    expect(extractDomain(undefined)).toBe("")
    expect(extractDomain("")).toBe("")
  })

  it("returns an empty string for unparseable urls", () => {
    expect(extractDomain("not a url")).toBe("")
  })
})

describe("formatCount", () => {
  it("keeps small numbers as-is", () => {
    expect(formatCount(0)).toBe("0")
    expect(formatCount(999)).toBe("999")
  })

  it("compacts thousands with one decimal", () => {
    expect(formatCount(1000)).toBe("1k")
    expect(formatCount(1234)).toBe("1.2k")
    expect(formatCount(25000)).toBe("25k")
  })
})

describe("formatScore", () => {
  it("pluralizes points", () => {
    expect(formatScore(1)).toBe("1 point")
    expect(formatScore(342)).toBe("342 points")
    expect(formatScore(1200)).toBe("1.2k points")
  })

  it("returns an empty string when the item has no score", () => {
    expect(formatScore(undefined)).toBe("")
  })
})

describe("formatComments", () => {
  it("pluralizes comments", () => {
    expect(formatComments(1)).toBe("1 comment")
    expect(formatComments(128)).toBe("128 comments")
    expect(formatComments(1500)).toBe("1.5k comments")
  })

  it("reports missing and zero as no comments", () => {
    expect(formatComments(undefined)).toBe("no comments")
    expect(formatComments(0)).toBe("no comments")
  })
})
