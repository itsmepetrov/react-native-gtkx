import { describe, expect, it } from "vitest"
import { decodeEntities, htmlToText } from "../../src/html"

describe("decodeEntities", () => {
  it("decodes the named entities HN emits", () => {
    expect(decodeEntities("Ben &amp; Jerry")).toBe("Ben & Jerry")
    expect(decodeEntities("&quot;quoted&quot;")).toBe('"quoted"')
    expect(decodeEntities("&lt;View&gt;")).toBe("<View>")
  })

  it("decodes decimal references", () => {
    expect(decodeEntities("&#38;")).toBe("&")
    expect(decodeEntities("&#8212;")).toBe("—")
  })

  it("decodes hex references", () => {
    expect(decodeEntities("don&#x27;t")).toBe("don't")
    expect(decodeEntities("&#x2F;")).toBe("/")
  })

  it("decodes each entity exactly once", () => {
    // Double-encoded input must not collapse to the raw character.
    expect(decodeEntities("&amp;amp;")).toBe("&amp;")
    expect(decodeEntities("&amp;#38;")).toBe("&#38;")
  })

  it("passes unknown names and invalid code points through", () => {
    expect(decodeEntities("&nope;")).toBe("&nope;")
    expect(decodeEntities("&#1114112;")).toBe("&#1114112;")
    expect(decodeEntities("a & b")).toBe("a & b")
  })
})

describe("htmlToText", () => {
  it("turns bare <p> separators into paragraph breaks", () => {
    expect(htmlToText("First<p>Second<p>Third")).toBe(
      "First\n\nSecond\n\nThird",
    )
  })

  it("handles well-formed <p>…</p> pairs without extra blank lines", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One\n\nTwo")
  })

  it("replaces links with their href", () => {
    // HN ellipsises long link text; the href is the useful part.
    expect(
      htmlToText(
        'See <a href="https://example.com/very/long/path" rel="nofollow">https:&#x2F;&#x2F;example.com&#x2F;very&#x2F;lo...</a> for more',
      ),
    ).toBe("See https://example.com/very/long/path for more")
  })

  it("decodes entities inside the href", () => {
    expect(htmlToText('<a href="https://example.com/?a=1&amp;b=2">x</a>')).toBe(
      "https://example.com/?a=1&b=2",
    )
  })

  it("keeps the inner text of an <a> without href", () => {
    expect(htmlToText("<a>just text</a>")).toBe("just text")
  })

  it("drops formatting tags but keeps their text", () => {
    expect(
      htmlToText("<i>italic</i> and <b>bold</b> and <code>x = 1</code>"),
    ).toBe("italic and bold and x = 1")
  })

  it("keeps newlines inside <pre> blocks", () => {
    expect(htmlToText("<pre><code>line one\n  line two</code></pre>")).toBe(
      "line one\n  line two",
    )
  })

  it("drops unknown tags and attributes cleanly", () => {
    expect(
      htmlToText('<span class="x">kept</span><blink>also kept</blink>'),
    ).toBe("kept" + "also kept")
  })

  it("decodes entities in plain text", () => {
    expect(htmlToText("Tom &amp; Jerry don&#x27;t &quot;fight&quot;")).toBe(
      'Tom & Jerry don\'t "fight"',
    )
  })

  it("trims leading and trailing breaks", () => {
    expect(htmlToText("<p></p><p>Hi<p></p>")).toBe("Hi")
  })

  it("returns an empty string for empty input", () => {
    expect(htmlToText("")).toBe("")
  })
})
