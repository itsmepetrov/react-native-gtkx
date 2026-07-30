// GTK integration tests for the style pipeline: the real `css`
// helper from the bridge registers generated GTK CSS, and the resulting
// class applies to a GtkBox via cssClasses. Linux-only (npm run test:gtk).

import { render, screenshot } from "@gtkx/testing"
import { createRef } from "react"
import { describe, expect, it } from "vitest"
import { createCssRegistry, visualStyleToCss } from "../../../src/style/index"
import { defaultCssRegistry } from "../../../src/style/registry.gtkx"
import { css, GtkBox, type Gtk } from "../../../src/gtkx/bridge/index"

describe("bridge css + generated GTK CSS", () => {
  it("registers a visualStyleToCss string through the real css helper", () => {
    const cssText = visualStyleToCss({
      backgroundColor: "#ff0000",
      borderRadius: 4,
    })
    const className = css(cssText)
    expect(className).toMatch(/^gtkx-/)
  })

  it("memoizes classes through the real css function", () => {
    const registry = createCssRegistry((cssText) => css(cssText))

    const first = registry.getClassName({
      backgroundColor: "red",
      borderRadius: 4,
    })
    // Same style, different key order — same class.
    const second = registry.getClassName({
      borderRadius: 4,
      backgroundColor: "red",
    })
    expect(first).not.toBeNull()
    expect(second).toBe(first)

    const other = registry.getClassName({ backgroundColor: "blue" })
    expect(other).not.toBeNull()
    expect(other).not.toBe(first)
  })

  it("returns null from the default registry for CSS-less styles", () => {
    expect(
      defaultCssRegistry.getClassName({ transform: [{ translateX: 5 }] }),
    ).toBeNull()
  })
})

describe("visual smoke on GtkBox", () => {
  it("applies background, border, radius and opacity via cssClasses", async () => {
    const className = defaultCssRegistry.getClassName({
      backgroundColor: "#1c71d8",
      borderColor: "rgba(0, 0, 0, 0.5)",
      borderRadius: 12,
      borderWidth: 2,
      opacity: 0.9,
    })
    expect(className).not.toBeNull()

    const fixedRef = createRef<Gtk.Box | null>()
    await render(
      <GtkBox
        ref={fixedRef}
        widthRequest={200}
        heightRequest={120}
        cssClasses={[className!]}
      />,
    )

    const fixed = fixedRef.current
    expect(fixed).not.toBeNull()
    expect(fixed!.hasCssClass(className!)).toBe(true)

    // The styled widget renders to a non-empty surface without GTK errors.
    const shot = await screenshot(fixed!)
    expect(shot.width).toBeGreaterThan(0)
    expect(shot.height).toBeGreaterThan(0)
    expect(shot.data.length).toBeGreaterThan(0)
  })

  it("applies per-side borders and a dashed border style", async () => {
    const className = defaultCssRegistry.getClassName({
      borderStyle: "dashed",
      borderWidth: 1,
      borderTopWidth: 3,
      borderColor: "#000000",
      borderLeftColor: "#e01b24",
    })
    expect(className).not.toBeNull()

    const fixedRef = createRef<Gtk.Box | null>()
    await render(
      <GtkBox
        ref={fixedRef}
        widthRequest={120}
        heightRequest={80}
        cssClasses={[className!]}
      />,
    )
    expect(fixedRef.current!.hasCssClass(className!)).toBe(true)
  })

  it("applies Adwaita PlatformColor variables without GTK CSS errors", async () => {
    const className = defaultCssRegistry.getClassName({
      backgroundColor: "var(--accent-bg-color)",
      color: "var(--accent-fg-color)",
    })
    expect(className).not.toBeNull()

    const fixedRef = createRef<Gtk.Box | null>()
    await render(
      <GtkBox
        ref={fixedRef}
        widthRequest={64}
        heightRequest={64}
        cssClasses={[className!]}
      />,
    )
    expect(fixedRef.current!.hasCssClass(className!)).toBe(true)
  })
})
