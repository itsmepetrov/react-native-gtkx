// Animated.ValueXY — two Animated.Values that move together.
//
// It exists because it is the other half of PanResponder: essentially every
// React Native drag in the wild is `new Animated.ValueXY()` plus
// `pan.setValue({ x: gesture.dx, y: gesture.dy })`, and the transform comes
// from `getTranslateTransform()`. Shipping the responder system without this
// meant portable drag code still did not run — which the gallery found the
// moment it was pointed at a real screen.
//
// There is no new machinery here: every method delegates to the two values,
// which is exactly how RN implements it.
import { AnimatedValue } from "./value"

export type ValueXYLiteral = { x: number; y: number }

export type ValueXYListener = (value: ValueXYLiteral) => void

export class AnimatedValueXY {
  readonly x: AnimatedValue
  readonly y: AnimatedValue
  private readonly _listeners = new Map<
    string,
    { x: string; y: string; listener: ValueXYListener }
  >()
  private _nextListenerId = 1

  constructor(value: ValueXYLiteral = { x: 0, y: 0 }) {
    this.x = new AnimatedValue(value.x)
    this.y = new AnimatedValue(value.y)
  }

  setValue(value: ValueXYLiteral): void {
    this.x.setValue(value.x)
    this.y.setValue(value.y)
  }

  setOffset(offset: ValueXYLiteral): void {
    this.x.setOffset(offset.x)
    this.y.setOffset(offset.y)
  }

  flattenOffset(): void {
    this.x.flattenOffset()
    this.y.flattenOffset()
  }

  extractOffset(): void {
    this.x.extractOffset()
    this.y.extractOffset()
  }

  /**
   * Fires on movement of EITHER axis, with both current values — RN's
   * contract. Both subscriptions are kept so removeListener can undo them.
   */
  addListener(listener: ValueXYListener): string {
    const id = String(this._nextListenerId++)
    const emit = (): void => {
      listener({ x: this.x.__getValue(), y: this.y.__getValue() })
    }
    this._listeners.set(id, {
      x: this.x.addListener(emit),
      y: this.y.addListener(emit),
      listener,
    })
    return id
  }

  removeListener(id: string): void {
    const entry = this._listeners.get(id)
    if (!entry) {
      return
    }
    this.x.removeListener(entry.x)
    this.y.removeListener(entry.y)
    this._listeners.delete(id)
  }

  removeAllListeners(): void {
    for (const id of [...this._listeners.keys()]) {
      this.removeListener(id)
    }
  }

  stopAnimation(callback?: (value: ValueXYLiteral) => void): void {
    this.x.stopAnimation()
    this.y.stopAnimation()
    callback?.(this.__getValue())
  }

  resetAnimation(callback?: (value: ValueXYLiteral) => void): void {
    this.x.resetAnimation()
    this.y.resetAnimation()
    callback?.(this.__getValue())
  }

  /** RN's absolute-positioning helper. */
  getLayout(): { left: AnimatedValue; top: AnimatedValue } {
    return { left: this.x, top: this.y }
  }

  /** The transform array a dragged view spreads into its style. */
  getTranslateTransform(): [
    { translateX: AnimatedValue },
    { translateY: AnimatedValue },
  ] {
    return [{ translateX: this.x }, { translateY: this.y }]
  }

  __getValue(): ValueXYLiteral {
    return { x: this.x.__getValue(), y: this.y.__getValue() }
  }
}
