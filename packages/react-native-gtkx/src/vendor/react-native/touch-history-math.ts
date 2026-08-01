/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// VENDORED from react-native (MIT), Libraries/Interaction/TouchHistoryMath.js.
// Kept in this repository for the same reason react-native-web vendors
// PanResponder: the maths are the contract, and reimplementing them would
// mean reimplementing a subtlety we do not have the test cases for (see the
// comment about clustered multi-touch movement in pan-responder.ts).
//
// Changes from upstream, and only these:
// - Flow annotations transliterated to TypeScript;
// - upstream annotates its own touch-history parameter with the name of the
//   const it is declaring (a self-reference Flow tolerates behind two
//   $FlowFixMe suppressions); that parameter is typed `TouchHistory` here;
// - the trailing `as {...}` cast, which existed only to break that Flow
//   cycle, is dropped;
// - `object.method` shorthand instead of `key: function ()`.
//
// Do not "improve" this file. Diffing it against upstream must stay trivial.
import type { TouchHistory } from "../../responder/types"

const noCentroid = -1

/**
 * This code is optimized and not intended to look beautiful. This allows
 * computing of touch centroids that have moved after `touchesChangedAfter`
 * timeStamp. You can compute the current centroid involving all touches
 * moves after `touchesChangedAfter`, or you can compute the previous
 * centroid of all touches that were moved after `touchesChangedAfter`.
 *
 * @param touchHistory Standard Responder touch track data.
 * @param touchesChangedAfter timeStamp after which moved touches are
 * considered "actively moving" - not just "active".
 * @param isXAxis Consider `x` dimension vs. `y` dimension.
 * @param ofCurrent Compute current centroid for actively moving touches vs.
 * previous centroid of now actively moving touches.
 * @return value of centroid in specified dimension.
 */
const centroidDimension = (
  touchHistory: TouchHistory,
  touchesChangedAfter: number,
  isXAxis: boolean,
  ofCurrent: boolean,
): number => {
  const touchBank = touchHistory.touchBank
  let total = 0
  let count = 0

  const oneTouchData =
    touchHistory.numberActiveTouches === 1
      ? touchHistory.touchBank[touchHistory.indexOfSingleActiveTouch]
      : null

  if (oneTouchData !== null && oneTouchData !== undefined) {
    if (
      oneTouchData.touchActive &&
      oneTouchData.currentTimeStamp > touchesChangedAfter
    ) {
      total +=
        ofCurrent && isXAxis
          ? oneTouchData.currentPageX
          : ofCurrent && !isXAxis
            ? oneTouchData.currentPageY
            : !ofCurrent && isXAxis
              ? oneTouchData.previousPageX
              : oneTouchData.previousPageY
      count = 1
    }
  } else {
    for (let i = 0; i < touchBank.length; i++) {
      const touchTrack = touchBank[i]
      if (
        touchTrack !== null &&
        touchTrack !== undefined &&
        touchTrack.touchActive &&
        touchTrack.currentTimeStamp >= touchesChangedAfter
      ) {
        let toAdd // Yuck, program temporarily in invalid state.
        if (ofCurrent && isXAxis) {
          toAdd = touchTrack.currentPageX
        } else if (ofCurrent && !isXAxis) {
          toAdd = touchTrack.currentPageY
        } else if (!ofCurrent && isXAxis) {
          toAdd = touchTrack.previousPageX
        } else {
          toAdd = touchTrack.previousPageY
        }
        total += toAdd
        count++
      }
    }
  }
  return count > 0 ? total / count : noCentroid
}

const TouchHistoryMath = {
  centroidDimension,

  currentCentroidXOfTouchesChangedAfter(
    touchHistory: TouchHistory,
    touchesChangedAfter: number,
  ): number {
    return centroidDimension(
      touchHistory,
      touchesChangedAfter,
      true, // isXAxis
      true, // ofCurrent
    )
  },

  currentCentroidYOfTouchesChangedAfter(
    touchHistory: TouchHistory,
    touchesChangedAfter: number,
  ): number {
    return centroidDimension(
      touchHistory,
      touchesChangedAfter,
      false, // isXAxis
      true, // ofCurrent
    )
  },

  previousCentroidXOfTouchesChangedAfter(
    touchHistory: TouchHistory,
    touchesChangedAfter: number,
  ): number {
    return centroidDimension(
      touchHistory,
      touchesChangedAfter,
      true, // isXAxis
      false, // ofCurrent
    )
  },

  previousCentroidYOfTouchesChangedAfter(
    touchHistory: TouchHistory,
    touchesChangedAfter: number,
  ): number {
    return centroidDimension(
      touchHistory,
      touchesChangedAfter,
      false, // isXAxis
      false, // ofCurrent
    )
  },

  currentCentroidX(touchHistory: TouchHistory): number {
    return centroidDimension(
      touchHistory,
      0, // touchesChangedAfter
      true, // isXAxis
      true, // ofCurrent
    )
  },

  currentCentroidY(touchHistory: TouchHistory): number {
    return centroidDimension(
      touchHistory,
      0, // touchesChangedAfter
      false, // isXAxis
      true, // ofCurrent
    )
  },

  noCentroid,
}

export default TouchHistoryMath
