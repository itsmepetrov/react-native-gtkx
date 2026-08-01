// The touch-history store, transcribed from RN's ResponderTouchHistoryStore
// so the vendored PanResponder runs against it unmodified.
//
// Everything here is deliberately mechanical. The three-way split — start /
// previous / current — is what makes velocity and clustered multi-touch
// accumulation computable at all, and "previous" specifically means the
// value before THIS event, not one frame ago. Collapsing any of it would
// break TouchHistoryMath in ways that only show up as a subtly wrong vx.
import type { NativeTouch, TouchHistory, TouchRecord } from "./types"

export const createTouchHistory = (): TouchHistory => ({
  touchBank: [],
  numberActiveTouches: 0,
  indexOfSingleActiveTouch: -1,
  mostRecentTimeStamp: 0,
})

export const recordTouchStart = (
  history: TouchHistory,
  touch: NativeTouch,
): void => {
  const identifier = touch.identifier
  const existing = history.touchBank[identifier]
  if (existing) {
    existing.touchActive = true
    existing.startPageX = touch.pageX
    existing.startPageY = touch.pageY
    existing.startTimeStamp = touch.timestamp
    existing.currentPageX = touch.pageX
    existing.currentPageY = touch.pageY
    existing.currentTimeStamp = touch.timestamp
    existing.previousPageX = touch.pageX
    existing.previousPageY = touch.pageY
    existing.previousTimeStamp = touch.timestamp
  } else {
    const record: TouchRecord = {
      touchActive: true,
      startPageX: touch.pageX,
      startPageY: touch.pageY,
      startTimeStamp: touch.timestamp,
      currentPageX: touch.pageX,
      currentPageY: touch.pageY,
      currentTimeStamp: touch.timestamp,
      previousPageX: touch.pageX,
      previousPageY: touch.pageY,
      previousTimeStamp: touch.timestamp,
    }
    history.touchBank[identifier] = record
  }
  history.mostRecentTimeStamp = touch.timestamp
}

const recordTouchMoveOrEnd = (
  history: TouchHistory,
  touch: NativeTouch,
  stillActive: boolean,
): void => {
  const record = history.touchBank[touch.identifier]
  if (!record) {
    // Upstream warns here. A move without a start means the event source and
    // the store disagree, which is a bug in the caller, not a user error.
    return
  }
  record.touchActive = stillActive
  record.previousPageX = record.currentPageX
  record.previousPageY = record.currentPageY
  record.previousTimeStamp = record.currentTimeStamp
  record.currentPageX = touch.pageX
  record.currentPageY = touch.pageY
  record.currentTimeStamp = touch.timestamp
  history.mostRecentTimeStamp = touch.timestamp
}

export const recordTouchMove = (
  history: TouchHistory,
  touch: NativeTouch,
): void => {
  recordTouchMoveOrEnd(history, touch, true)
}

export const recordTouchEnd = (
  history: TouchHistory,
  touch: NativeTouch,
): void => {
  recordTouchMoveOrEnd(history, touch, false)
}

/**
 * Recomputes `numberActiveTouches` and `indexOfSingleActiveTouch` — the two
 * derived fields TouchHistoryMath's single-touch fast path reads.
 */
export const refreshActiveTouches = (history: TouchHistory): void => {
  let active = 0
  let singleIndex = -1
  for (let i = 0; i < history.touchBank.length; i += 1) {
    const record = history.touchBank[i]
    if (record?.touchActive) {
      active += 1
      singleIndex = i
    }
  }
  history.numberActiveTouches = active
  history.indexOfSingleActiveTouch = active === 1 ? singleIndex : -1
}
