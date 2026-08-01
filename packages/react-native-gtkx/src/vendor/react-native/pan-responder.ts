/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// VENDORED from react-native (MIT), Libraries/Interaction/PanResponder.js.
//
// react-native-web re-exports Meta's file directly and it works untouched,
// because RNW reproduces the touchHistory structure PanResponder expects. We
// reproduce the same structure (src/responder/touch-history.ts), so the
// algorithm below is upstream's, unmodified in substance.
//
// We cannot re-export it the way RNW does: upstream ships Flow, and this
// package is one tsc emit. So it is transliterated, and ONLY transliterated:
// - Flow annotations to TypeScript (`?number` to `number | null`,
//   inexact object types to plain ones, `Readonly<{}>` kept as-is);
// - `GestureResponderEvent` imported from our responder types instead of
//   RN's CoreEventTypes;
// - `require` to `import`.
//
// The logic is deliberately untouched, comments included — especially the
// clustered multi-touch accumulation in _updateGestureStateOnMove, which is
// the part with no obvious specification and the reason vendoring beats
// reimplementing.
import type { GestureResponderEvent } from "../../responder/types"
import TouchHistoryMath from "./touch-history-math"

const currentCentroidXOfTouchesChangedAfter =
  TouchHistoryMath.currentCentroidXOfTouchesChangedAfter
const currentCentroidYOfTouchesChangedAfter =
  TouchHistoryMath.currentCentroidYOfTouchesChangedAfter
const previousCentroidXOfTouchesChangedAfter =
  TouchHistoryMath.previousCentroidXOfTouchesChangedAfter
const previousCentroidYOfTouchesChangedAfter =
  TouchHistoryMath.previousCentroidYOfTouchesChangedAfter
const currentCentroidX = TouchHistoryMath.currentCentroidX
const currentCentroidY = TouchHistoryMath.currentCentroidY

export type PanResponderGestureState = {
  /** ID of the gestureState - persisted as long as there's a touch on screen */
  stateID: number
  /** the latest screen coordinates of the recently-moved touch */
  moveX: number
  /** the latest screen coordinates of the recently-moved touch */
  moveY: number
  /** the screen coordinates of the responder grant */
  x0: number
  /** the screen coordinates of the responder grant */
  y0: number
  /** accumulated distance of the gesture since the touch started */
  dx: number
  /** accumulated distance of the gesture since the touch started */
  dy: number
  /** current velocity of the gesture */
  vx: number
  /** current velocity of the gesture */
  vy: number
  /** Number of touches currently on screen */
  numberActiveTouches: number
  /** All `gestureState` accounts for timeStamps up until this value */
  _accountsForMovesUpTo: number
}

type ActiveCallback = (
  event: GestureResponderEvent,
  gestureState: PanResponderGestureState,
) => boolean

type PassiveCallback = (
  event: GestureResponderEvent,
  gestureState: PanResponderGestureState,
) => unknown

export type GestureResponderHandlerMethods = {
  onMoveShouldSetResponder: (event: GestureResponderEvent) => boolean
  onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => boolean
  onResponderEnd: (event: GestureResponderEvent) => void
  onResponderGrant: (event: GestureResponderEvent) => boolean
  onResponderMove: (event: GestureResponderEvent) => void
  onResponderReject: (event: GestureResponderEvent) => void
  onResponderRelease: (event: GestureResponderEvent) => void
  onResponderStart: (event: GestureResponderEvent) => void
  onResponderTerminate: (event: GestureResponderEvent) => void
  onResponderTerminationRequest: (event: GestureResponderEvent) => boolean
  onStartShouldSetResponder: (event: GestureResponderEvent) => boolean
  onStartShouldSetResponderCapture: (event: GestureResponderEvent) => boolean
}

export type PanResponderCallbacks = Readonly<{
  onMoveShouldSetPanResponder?: ActiveCallback
  onMoveShouldSetPanResponderCapture?: ActiveCallback
  onStartShouldSetPanResponder?: ActiveCallback
  onStartShouldSetPanResponderCapture?: ActiveCallback
  onPanResponderGrant?: PassiveCallback
  onPanResponderMove?: PassiveCallback
  onPanResponderRelease?: PassiveCallback
  onPanResponderTerminate?: PassiveCallback
  onPanResponderReject?: PassiveCallback
  onPanResponderStart?: PassiveCallback
  onPanResponderEnd?: PassiveCallback
  onPanResponderTerminationRequest?: ActiveCallback
  onShouldBlockNativeResponder?: ActiveCallback
}>

const PanResponder = {
  _initializeGestureState(gestureState: PanResponderGestureState): void {
    gestureState.moveX = 0
    gestureState.moveY = 0
    gestureState.x0 = 0
    gestureState.y0 = 0
    gestureState.dx = 0
    gestureState.dy = 0
    gestureState.vx = 0
    gestureState.vy = 0
    gestureState.numberActiveTouches = 0
    // All `gestureState` accounts for timeStamps up until:
    gestureState._accountsForMovesUpTo = 0
  },

  /**
   * This is nuanced and is necessary. It is incorrect to continuously take all
   * active *and* recently moved touches, find the centroid, and track how that
   * result changes over time. Instead, we must take all recently moved
   * touches, and calculate how the centroid has changed just for those
   * recently moved touches, and append that change to an accumulator. This is
   * to (at least) handle the case where the user is moving three fingers, and
   * then one of the fingers stops but the other two continue.
   *
   * This is very different than taking all of the recently moved touches and
   * storing their centroid as `dx/dy`. For correctness, we must *accumulate
   * changes* in the centroid of recently moved touches.
   *
   * There is also some nuance with how we handle multiple moved touches in a
   * single event. With the way `ReactNativeEventEmitter` dispatches touches as
   * individual events, multiple touches generate two 'move' events, each of
   * them triggering `onResponderMove`. But with the way `PanResponder` works,
   * all of the gesture inference is performed on the first dispatch, since it
   * looks at all of the touches (even the ones for which there hasn't been a
   * native dispatch yet). Therefore, `PanResponder` does not call
   * `onResponderMove` passed the first dispatch. This diverges from the
   * typical responder callback pattern (without using `PanResponder`), but
   * avoids more dispatches than necessary.
   */
  _updateGestureStateOnMove(
    gestureState: PanResponderGestureState,
    touchHistory: GestureResponderEvent["touchHistory"],
  ): void {
    gestureState.numberActiveTouches = touchHistory.numberActiveTouches
    gestureState.moveX = currentCentroidXOfTouchesChangedAfter(
      touchHistory,
      gestureState._accountsForMovesUpTo,
    )
    gestureState.moveY = currentCentroidYOfTouchesChangedAfter(
      touchHistory,
      gestureState._accountsForMovesUpTo,
    )
    const movedAfter = gestureState._accountsForMovesUpTo
    const prevX = previousCentroidXOfTouchesChangedAfter(
      touchHistory,
      movedAfter,
    )
    const x = currentCentroidXOfTouchesChangedAfter(touchHistory, movedAfter)
    const prevY = previousCentroidYOfTouchesChangedAfter(
      touchHistory,
      movedAfter,
    )
    const y = currentCentroidYOfTouchesChangedAfter(touchHistory, movedAfter)
    const nextDX = gestureState.dx + (x - prevX)
    const nextDY = gestureState.dy + (y - prevY)

    // TODO: This must be filtered intelligently.
    const dt =
      touchHistory.mostRecentTimeStamp - gestureState._accountsForMovesUpTo
    gestureState.vx = (nextDX - gestureState.dx) / dt
    gestureState.vy = (nextDY - gestureState.dy) / dt

    gestureState.dx = nextDX
    gestureState.dy = nextDY
    gestureState._accountsForMovesUpTo = touchHistory.mostRecentTimeStamp
  },

  /**
   * @param config Enhanced versions of all of the responder callbacks that
   * provide not only the typical `ResponderSyntheticEvent`, but also the
   * `PanResponder` gesture state. Simply replace the word `Responder` with
   * `PanResponder` in each of the typical `onResponder*` callbacks.
   */
  create(config: PanResponderCallbacks): {
    getInteractionHandle: () => number | null
    panHandlers: GestureResponderHandlerMethods
  } {
    const gestureState: PanResponderGestureState = {
      // Useful for debugging
      stateID: Math.random(),
      moveX: 0,
      moveY: 0,
      x0: 0,
      y0: 0,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      numberActiveTouches: 0,
      _accountsForMovesUpTo: 0,
    }
    const panHandlers: GestureResponderHandlerMethods = {
      onStartShouldSetResponder(event: GestureResponderEvent): boolean {
        return config.onStartShouldSetPanResponder == null
          ? false
          : config.onStartShouldSetPanResponder(event, gestureState)
      },
      onMoveShouldSetResponder(event: GestureResponderEvent): boolean {
        return config.onMoveShouldSetPanResponder == null
          ? false
          : config.onMoveShouldSetPanResponder(event, gestureState)
      },
      onStartShouldSetResponderCapture(event: GestureResponderEvent): boolean {
        // TODO: Actually, we should reinitialize the state any time
        // touches.length increases from 0 active to > 0 active.
        if (event.nativeEvent.touches.length === 1) {
          PanResponder._initializeGestureState(gestureState)
        }
        gestureState.numberActiveTouches =
          event.touchHistory.numberActiveTouches
        return config.onStartShouldSetPanResponderCapture != null
          ? config.onStartShouldSetPanResponderCapture(event, gestureState)
          : false
      },

      onMoveShouldSetResponderCapture(event: GestureResponderEvent): boolean {
        const touchHistory = event.touchHistory
        // Responder system incorrectly dispatches should* to current responder
        // Filter out any touch moves past the first one - we would have
        // already processed multi-touch geometry during the first event.
        if (
          gestureState._accountsForMovesUpTo ===
          touchHistory.mostRecentTimeStamp
        ) {
          return false
        }
        PanResponder._updateGestureStateOnMove(gestureState, touchHistory)
        return config.onMoveShouldSetPanResponderCapture
          ? config.onMoveShouldSetPanResponderCapture(event, gestureState)
          : false
      },

      onResponderGrant(event: GestureResponderEvent): boolean {
        gestureState.x0 = currentCentroidX(event.touchHistory)
        gestureState.y0 = currentCentroidY(event.touchHistory)
        gestureState.dx = 0
        gestureState.dy = 0
        if (config.onPanResponderGrant) {
          config.onPanResponderGrant(event, gestureState)
        }
        // TODO: t7467124 investigate if this can be removed
        return config.onShouldBlockNativeResponder == null
          ? true
          : config.onShouldBlockNativeResponder(event, gestureState)
      },

      onResponderReject(event: GestureResponderEvent): void {
        config.onPanResponderReject?.call(undefined, event, gestureState)
      },

      onResponderRelease(event: GestureResponderEvent): void {
        config.onPanResponderRelease?.call(undefined, event, gestureState)
        PanResponder._initializeGestureState(gestureState)
      },

      onResponderStart(event: GestureResponderEvent): void {
        const touchHistory = event.touchHistory
        gestureState.numberActiveTouches = touchHistory.numberActiveTouches
        if (config.onPanResponderStart) {
          config.onPanResponderStart(event, gestureState)
        }
      },

      onResponderMove(event: GestureResponderEvent): void {
        const touchHistory = event.touchHistory
        // Guard against the dispatch of two touch moves when there are two
        // simultaneously changed touches.
        if (
          gestureState._accountsForMovesUpTo ===
          touchHistory.mostRecentTimeStamp
        ) {
          return
        }
        // Filter out any touch moves past the first one - we would have
        // already processed multi-touch geometry during the first event.
        PanResponder._updateGestureStateOnMove(gestureState, touchHistory)
        if (config.onPanResponderMove) {
          config.onPanResponderMove(event, gestureState)
        }
      },

      onResponderEnd(event: GestureResponderEvent): void {
        const touchHistory = event.touchHistory
        gestureState.numberActiveTouches = touchHistory.numberActiveTouches
        config.onPanResponderEnd?.call(undefined, event, gestureState)
      },

      onResponderTerminate(event: GestureResponderEvent): void {
        config.onPanResponderTerminate?.call(undefined, event, gestureState)
        PanResponder._initializeGestureState(gestureState)
      },

      onResponderTerminationRequest(event: GestureResponderEvent): boolean {
        return config.onPanResponderTerminationRequest == null
          ? true
          : config.onPanResponderTerminationRequest(event, gestureState)
      },
    }
    return {
      panHandlers,
      getInteractionHandle(): number | null {
        // TODO: Deprecate and delete this method.
        return null
      },
    }
  },
}

export type PanResponderInstance = ReturnType<(typeof PanResponder)["create"]>

export default PanResponder
