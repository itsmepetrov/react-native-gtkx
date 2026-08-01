// Animated.Value and the read-only interpolation node. Values are observable
// numbers; the animation runner (value-animation.ts) drives them frame by
// frame through the __-prefixed internal hooks. Interpolation nodes subscribe
// to their parent lazily (only while they have listeners themselves) and can
// be interpolated again, cascading from the parent's numeric value.

import { createInterpolator } from "./interpolate"
import type {
  InterpolationConfig,
  InterpolationListener,
  ValueListener,
} from "./types"

// Internal handle a running animation registers on its value; the value calls
// stop() to preempt it when a newer animation (or setValue) takes over — the
// preempted animation ends with { finished: false }, matching RN.
export type AnimationHandle = { stop(): void }

// Minimal parent protocol shared by AnimatedValue and AnimatedInterpolation,
// enabling cascaded interpolate() chains over either kind of node.
type InterpolationParent = {
  __getValue(): number | string
  addListener(listener: InterpolationListener): string
  removeListener(id: string): void
}

// Cascading from a string-producing parent ("45deg") interpolates over its
// numeric part.
const numeric = (value: number | string): number =>
  typeof value === "number" ? value : parseFloat(value)

export class AnimatedValue {
  private _value: number
  // RN splits a value into an animated part and a static offset: a drag sets
  // the offset to where the last gesture ended, so dx/dy can keep starting
  // from zero. Everything observable is the SUM; the animation runner only
  // ever drives `_value`, so an untouched offset (0) leaves behaviour
  // byte-identical to before it existed.
  private _offset = 0
  private readonly _startingValue: number
  private readonly _listeners = new Map<string, ValueListener>()
  private _nextListenerId = 1
  private _animation: AnimationHandle | null = null

  constructor(value: number) {
    this._value = value
    this._startingValue = value
  }

  // Stops the running animation (its callback gets { finished: false }, as in
  // RN) and jumps to the new value.
  setValue(value: number): void {
    this._animation?.stop()
    this.__updateValue(value)
  }

  /** Sets the static part. The animated part is left where it is. */
  setOffset(offset: number): void {
    this._offset = offset
    this.__notify()
  }

  /** Folds the offset into the value, leaving the sum unchanged. */
  flattenOffset(): void {
    this._value += this._offset
    this._offset = 0
    this.__notify()
  }

  /** The mirror of flattenOffset: moves the value into the offset. */
  extractOffset(): void {
    this._offset += this._value
    this._value = 0
    this.__notify()
  }

  addListener(listener: ValueListener): string {
    const id = String(this._nextListenerId++)
    this._listeners.set(id, listener)
    return id
  }

  removeListener(id: string): void {
    this._listeners.delete(id)
  }

  removeAllListeners(): void {
    this._listeners.clear()
  }

  // Stops the running animation where it stands and reports the current value
  // to the callback. The stopped animation's own callback gets
  // { finished: false }.
  stopAnimation(callback?: (value: number) => void): void {
    this._animation?.stop()
    callback?.(this.__getValue())
  }

  // Stops any running animation, then snaps back to the construction-time
  // value. Unlike RN we do notify listeners about the snap-back: the direct
  // GTK path renders from listener events, so a silent reset would leave
  // widgets stale until the next animation frame.
  resetAnimation(callback?: (value: number) => void): void {
    this.stopAnimation(callback)
    this.__updateValue(this._startingValue)
  }

  interpolate(config: InterpolationConfig): AnimatedInterpolation {
    return new AnimatedInterpolation(this, config)
  }

  __getValue(): number {
    return this._value + this._offset
  }

  /** @internal Called by the animation runner on every frame. */
  __updateValue(value: number): void {
    this._value = value
    this.__notify()
  }

  /** @internal Publishes the current sum to every listener. */
  private __notify(): void {
    const value = this.__getValue()
    for (const listener of [...this._listeners.values()]) {
      listener({ value })
    }
  }

  /** @internal Registers a running animation, preempting the previous one. */
  __startAnimation(handle: AnimationHandle): void {
    const previous = this._animation
    this._animation = handle
    if (previous && previous !== handle) {
      previous.stop()
    }
  }

  /** @internal */
  __endAnimation(handle: AnimationHandle): void {
    if (this._animation === handle) {
      this._animation = null
    }
  }
}

export class AnimatedInterpolation {
  private readonly _parent: InterpolationParent
  private readonly _interpolator: (input: number) => number | string
  private readonly _listeners = new Map<string, InterpolationListener>()
  private _nextListenerId = 1
  private _parentSubscription: string | null = null

  constructor(parent: InterpolationParent, config: InterpolationConfig) {
    this._parent = parent
    this._interpolator = createInterpolator(config)
  }

  __getValue(): number | string {
    return this._interpolator(numeric(this._parent.__getValue()))
  }

  addListener(listener: InterpolationListener): string {
    const id = String(this._nextListenerId++)
    this._listeners.set(id, listener)
    if (this._parentSubscription === null) {
      // Lazy upstream subscription (same leak policy as the API emitters):
      // attach with the first listener, detach with the last one.
      this._parentSubscription = this._parent.addListener(({ value }) => {
        const output = this._interpolator(numeric(value))
        for (const entry of [...this._listeners.values()]) {
          entry({ value: output })
        }
      })
    }
    return id
  }

  removeListener(id: string): void {
    if (!this._listeners.delete(id)) {
      return
    }
    if (this._listeners.size === 0) {
      this._detachFromParent()
    }
  }

  removeAllListeners(): void {
    this._listeners.clear()
    this._detachFromParent()
  }

  interpolate(config: InterpolationConfig): AnimatedInterpolation {
    return new AnimatedInterpolation(this, config)
  }

  private _detachFromParent(): void {
    if (this._parentSubscription !== null) {
      this._parent.removeListener(this._parentSubscription)
      this._parentSubscription = null
    }
  }
}
