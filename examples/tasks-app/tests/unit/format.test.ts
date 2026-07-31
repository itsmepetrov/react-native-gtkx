import { describe, expect, it } from "vitest"
import {
  escapeMarkup,
  formatDateTime,
  formatDue,
  isToday,
} from "../../src/format"

describe("escapeMarkup", () => {
  it("escapes &, < and >", () => {
    expect(escapeMarkup("Q&A <tag> done")).toBe("Q&amp;A &lt;tag&gt; done")
  })

  it("leaves plain text untouched", () => {
    expect(escapeMarkup("Buy oat milk")).toBe("Buy oat milk")
  })
})

describe("isToday", () => {
  it("is false for null", () => {
    expect(isToday(null)).toBe(false)
  })

  it("is true for a timestamp earlier today", () => {
    const today = new Date()
    today.setHours(1, 0, 0, 0)
    expect(isToday(today.toISOString())).toBe(true)
  })

  it("is false for yesterday", () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(isToday(yesterday.toISOString())).toBe(false)
  })

  it("is false for tomorrow", () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(isToday(tomorrow.toISOString())).toBe(false)
  })
})

const atHour = (daysFromNow: number, hour: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

describe("formatDue", () => {
  it("is null for a null due date", () => {
    expect(formatDue(null)).toBeNull()
  })

  it("labels today as 'Today at <time>'", () => {
    expect(formatDue(atHour(0, 18))).toMatch(/^Today at /)
  })

  it("labels tomorrow as 'Tomorrow at <time>'", () => {
    expect(formatDue(atHour(1, 9))).toMatch(/^Tomorrow at /)
  })

  it("labels yesterday as 'Yesterday at <time>'", () => {
    expect(formatDue(atHour(-1, 9))).toMatch(/^Yesterday at /)
  })

  it("labels further past dates as '<n> days ago'", () => {
    expect(formatDue(atHour(-5, 9))).toBe("5 days ago")
  })

  it("labels dates within the week as a weekday name", () => {
    // 3 days out lands inside the "days < 7" branch for every start day.
    const due = new Date(atHour(3, 9))
    const expected = due.toLocaleDateString([], { weekday: "long" })
    expect(formatDue(due.toISOString())).toBe(expected)
  })

  it("labels dates a week or more out as 'Mon DD'", () => {
    const due = new Date(atHour(30, 9))
    const expected = due.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    })
    expect(formatDue(due.toISOString())).toBe(expected)
  })
})

describe("formatDateTime", () => {
  it("is 'Never' for null", () => {
    expect(formatDateTime(null)).toBe("Never")
  })

  it("formats a real timestamp", () => {
    const iso = new Date(2026, 0, 15, 9, 30).toISOString()
    expect(formatDateTime(iso)).not.toBe("Never")
    expect(formatDateTime(iso).length).toBeGreaterThan(0)
  })
})
