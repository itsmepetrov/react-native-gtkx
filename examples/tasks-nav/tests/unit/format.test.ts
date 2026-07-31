import { describe, expect, it } from "vitest"
import { escapeMarkup, formatDue } from "../../src/format"

describe("escapeMarkup", () => {
  it("escapes the characters Pango markup would otherwise eat", () => {
    expect(escapeMarkup(`Q&A <tag> "quoted"`)).toBe(
      "Q&amp;A &lt;tag&gt; &quot;quoted&quot;",
    )
  })

  it("leaves plain text untouched", () => {
    expect(escapeMarkup("Buy oat milk")).toBe("Buy oat milk")
  })
})

const atHour = (daysFromNow: number, hour: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

describe("formatDue", () => {
  it("is null for a task with no due date", () => {
    expect(formatDue(null)).toBeNull()
  })

  it("labels today, tomorrow and yesterday by name", () => {
    expect(formatDue(atHour(0, 18))).toMatch(/^Today at /)
    expect(formatDue(atHour(1, 9))).toMatch(/^Tomorrow at /)
    expect(formatDue(atHour(-1, 9))).toMatch(/^Yesterday at /)
  })

  it("counts whole days, not 24-hour spans", () => {
    // 00:30 tomorrow is less than a day away but is still "Tomorrow" —
    // the comparison is between calendar days on purpose.
    expect(formatDue(atHour(1, 0))).toMatch(/^Tomorrow at /)
  })

  it("labels further past dates as '<n> days ago'", () => {
    expect(formatDue(atHour(-5, 9))).toBe("5 days ago")
  })

  it("labels dates within the week as a weekday name", () => {
    // 3 days out lands inside the "days < 7" branch for every start day.
    const due = new Date(atHour(3, 9))
    expect(formatDue(due.toISOString())).toBe(
      due.toLocaleDateString([], { weekday: "long" }),
    )
  })

  it("labels dates a week or more out as an absolute date", () => {
    const due = new Date(atHour(30, 9))
    expect(formatDue(due.toISOString())).toBe(
      due.toLocaleDateString([], { month: "short", day: "numeric" }),
    )
  })
})
