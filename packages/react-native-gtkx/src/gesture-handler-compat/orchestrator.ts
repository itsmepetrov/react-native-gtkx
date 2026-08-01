// The activation loop: one place where every gesture in an interaction asks
// whether it may become active, and one place where an activation cancels
// everything it excludes.
//
// THE SECOND LOCK. The responder lock (src/responder) keeps its one job —
// this interaction belongs to React Native, one holder, one irrevocable GTK
// `CLAIMED` on the source. This loop is the second lock, at the second level,
// and it is JS-only by construction: it imports nothing from the platform,
// takes no widget, and never makes GTK claim anything. Every relation is
// resolved here BEFORE the responder lock is asked for, which is what makes
// the model honest given that GTK's `CLAIMED` cannot be taken back.
//
// Concretely: the FIRST gesture to activate in an interaction asks for the
// responder and becomes ACTIVE on the grant, exactly as slice 1 did. A gesture
// that activates alongside it — the only way that can happen is a simultaneous
// relation, see `shouldBeCancelledBy` — does NOT ask, because the interaction
// is already ours and there is nothing left to tell GTK. It becomes ACTIVE in
// this registry and is driven from the touch props, which fire regardless of
// responder status.
//
// Restated from behaviour, not transcribed: docs/research/gesture-detector.md,
// "Probe 2: what the orchestrator actually guarantees", has the specification
// this implements and the five rules it has to honour.
import { createRelationRegistry, type RelationRegistry } from "./relations"
import { GESTURE_STATE, type GestureStateValue } from "./types"

/** One mounted recognizer, as the loop sees it. */
export type Participant = {
  readonly tag: number
  /**
   * The recognizer kind.
   *
   * The loop reads exactly one thing off it — whether this is
   * `Gesture.Native()` — because that is the single rule the relation
   * registry contributes to cancellation, and it is why `Native` is special
   * rather than just another recognizer: an ALREADY ACTIVE or parked gesture
   * is cancelled by nothing except an active native one, and a gesture that
   * wants to activate beside one is refused by it. `@gorhom/bottom-sheet`'s
   * scrollable is the shape that needs both halves.
   */
  readonly kind: string
  /**
   * Cleared to become ACTIVE.
   *
   * `needsResponder` is false when another participant already holds the
   * interaction, and it is where the two locks meet: a gesture told `false`
   * activates in JS without touching the responder lock, which is the only
   * way `Simultaneous` can be expressed on a single-holder lock.
   */
  authorize: (needsResponder: boolean) => void
  /**
   * Whether this gesture is holding the responder right now.
   *
   * Asked rather than assumed, because "is anything else active" is the wrong
   * question and `Gesture.Native()` is what makes the difference visible: it
   * is ACTIVE and it deliberately holds nothing, so a pan activating beside it
   * still has an interaction to take. Nor is it a static per-kind fact — a
   * `Pan` that lost the lock to a simultaneous partner is a claiming kind that
   * does not hold it either.
   */
  holdsResponder: () => boolean
  /** Lost the arbitration: end now, unsuccessfully. */
  cancel: () => void
}

type Entry = {
  active: boolean
  awaiting: boolean
  /** Upstream's `activationIndex`: the order gestures took their turn in. */
  activationIndex: number
  /** END / FAILED / CANCELLED once it is over, null while it is live. */
  finishedAs: GestureStateValue | null
}

export type Orchestrator = {
  readonly relations: RelationRegistry
  /** This gesture reached BEGAN and is part of the interaction under way. */
  record: (participant: Participant) => void
  /** This gesture unmounted. Drops its relations with it. */
  forget: (participant: Participant) => void
  /** This gesture's own criteria are met; may it activate? */
  tryActivate: (participant: Participant) => void
  /** It really is ACTIVE now — the moment mutual exclusion is enforced. */
  activated: (participant: Participant) => void
  finished: (participant: Participant, outcome: GestureStateValue) => void
  /**
   * The participant holding the responder lost it to something outside this
   * registry — an ancestor took the interaction, or the window went away.
   */
  interactionLost: (participant: Participant) => void
  /** Whether the loop is holding this one in BEGAN, waiting on another. */
  isAwaiting: (participant: Participant) => boolean
  /** Every tag ACTIVE right now. `Simultaneous` is a claim about this list. */
  activeTags: () => number[]
  reset: () => void
}

export const createOrchestrator = (
  relations: RelationRegistry = createRelationRegistry(),
): Orchestrator => {
  const entries = new Map<Participant, Entry>()
  /** Recording order, because the broadcast cancel walks it backwards. */
  const recorded: Participant[] = []
  const awaiting: Participant[] = []
  let activationIndex = 0

  const isFinished = (entry: Entry): boolean => entry.finishedAs !== null

  const live = (participant: Participant): Entry | null => {
    const entry = entries.get(participant)
    return entry === undefined || isFinished(entry) ? null : entry
  }

  const drop = (list: Participant[], participant: Participant): void => {
    const index = list.indexOf(participant)
    if (index >= 0) {
      list.splice(index, 1)
    }
  }

  const unpark = (participant: Participant): void => {
    const entry = entries.get(participant)
    if (entry) {
      entry.awaiting = false
    }
    drop(awaiting, participant)
  }

  /**
   * Finished gestures are kept until the next interaction starts, not dropped
   * as they end, because `tryActivate` has to be able to tell a gesture it
   * waits for that already ENDED apart from one that was never here. Upstream
   * keeps them for a microtask and sweeps; sweeping at the next press is the
   * same guarantee without a scheduler, and a press is the only moment that
   * can put a gesture back into play.
   */
  const sweepFinished = (): void => {
    for (const participant of [...recorded]) {
      const entry = entries.get(participant)
      if (entry !== undefined && isFinished(entry)) {
        entries.delete(participant)
        drop(recorded, participant)
        drop(awaiting, participant)
      }
    }
  }

  /**
   * A simultaneous relation in EITHER direction exempts the pair, and a
   * gesture is always simultaneous with itself. Declaring it on one side is
   * enough — upstream also copies the relation onto the other gesture, which
   * this question makes unnecessary.
   */
  const canRunSimultaneously = (
    one: Participant,
    other: Participant,
  ): boolean =>
    one === other ||
    relations.shouldRecognizeSimultaneously(one.tag, other.tag) ||
    relations.shouldRecognizeSimultaneously(other.tag, one.tag)

  /**
   * The two spellings of one relation: `requireExternalGestureToFail` on the
   * waiter, and `blocksExternalGesture` on the gesture being waited for.
   */
  const shouldWaitForOther = (
    participant: Participant,
    other: Participant,
  ): boolean =>
    participant !== other &&
    (relations.shouldWaitForFailure(participant.tag, other.tag) ||
      relations.blocks(other.tag, participant.tag))

  /**
   * The one rule the relation registry contributes: a gesture that is already
   * ACTIVE, or parked waiting for another to fail, is cancelled only by an
   * active `Native` handler.
   *
   * Upstream exempts buttons from this too (`isButton()`); the button family —
   * `RectButton`, `BaseButton` and the rest — is refused by name on this
   * platform, so there is nothing for the exemption to apply to and adding a
   * flag nobody can set would be decoration.
   */
  const cancelledByActive = (other: Participant): boolean =>
    other.kind === "native" && entries.get(other)?.active === true

  /**
   * Should `participant` be cancelled because `winner` just activated?
   *
   * MUTUAL EXCLUSION IS THE DEFAULT and a simultaneous relation is the only
   * exemption. Upstream's third branch — two handlers that share no pointer
   * and sit on different views conflict only if a tracked pointer lies inside
   * both views' bounds — has no reachable case here: there is one pointer,
   * one interaction and one fabricated touch, a gesture is recorded only when
   * that touch reaches it, so every pair of recorded gestures shares it. What
   * upstream computes in that branch, this platform knows by construction.
   */
  const shouldBeCancelledBy = (
    participant: Participant,
    winner: Participant,
  ): boolean => {
    if (canRunSimultaneously(participant, winner)) {
      return false
    }
    const entry = entries.get(participant)
    if (entry?.active === true || entry?.awaiting === true) {
      return cancelledByActive(winner)
    }
    return true
  }

  /** The same question asked by the gesture that wants to activate. */
  const blockedFromActivating = (participant: Participant): boolean =>
    recorded.some(
      (other) =>
        other !== participant &&
        !canRunSimultaneously(participant, other) &&
        cancelledByActive(other),
    )

  const park = (participant: Participant): void => {
    const entry = entries.get(participant)
    if (entry === undefined || entry.awaiting) {
      return
    }
    entry.awaiting = true
    entry.activationIndex = activationIndex
    activationIndex += 1
    awaiting.push(participant)
  }

  const makeActive = (participant: Participant): void => {
    const entry = entries.get(participant)
    if (entry === undefined) {
      return
    }
    entry.activationIndex = activationIndex
    activationIndex += 1
    // The interaction is already React Native's once another gesture HOLDS
    // it, and `grant()` is a no-op for the GTK claim after the first one
    // anyway. So a second gesture does not ask for the responder — it would be
    // asking for a lock that is single-holder by design, and winning it would
    // take the interaction away from the gesture it was told to run alongside.
    //
    // Holding, not merely being active: an active `Gesture.Native()` holds
    // nothing on purpose, so a pan beside it still has a lock to take.
    const held = recorded.some(
      (other) =>
        other !== participant &&
        entries.get(other)?.active === true &&
        other.holdsResponder(),
    )
    participant.authorize(!held)
  }

  const tryActivate = (participant: Participant): void => {
    const entry = live(participant)
    if (entry === null || entry.active) {
      return
    }

    // Waiting for a gesture that already ENDED is not waiting, it is losing:
    // the thing this one was deferring to actually happened.
    if (
      recorded.some(
        (other) =>
          shouldWaitForOther(participant, other) &&
          entries.get(other)?.finishedAs === GESTURE_STATE.END,
      )
    ) {
      unpark(participant)
      participant.cancel()
      return
    }

    // Rule 1: park in BEGAN, holding nothing, until the other one finishes.
    // This is what `requireExternalGestureToFail` IS.
    if (
      recorded.some(
        (other) =>
          live(other) !== null && shouldWaitForOther(participant, other),
      )
    ) {
      park(participant)
      return
    }

    if (blockedFromActivating(participant)) {
      unpark(participant)
      participant.cancel()
      return
    }

    makeActive(participant)
  }

  const activated = (participant: Participant): void => {
    const entry = entries.get(participant)
    if (entry === undefined) {
      return
    }
    entry.active = true
    unpark(participant)

    // Upstream cancels the losers inside `makeActive`, because activation is
    // synchronous there. Here it is not always: a gesture that has to take the
    // responder first becomes ACTIVE only when the negotiation grants it, and
    // an ancestor can still win. Cancelling from the moment the gesture really
    // is ACTIVE is the same rule applied at the only moment it is true.
    for (let i = recorded.length - 1; i >= 0; i -= 1) {
      const other = recorded[i]!
      if (other !== participant && live(other) !== null) {
        if (shouldBeCancelledBy(other, participant)) {
          other.cancel()
        }
      }
    }
  }

  const finished = (
    participant: Participant,
    outcome: GestureStateValue,
  ): void => {
    const entry = entries.get(participant)
    if (entry === undefined) {
      return
    }
    entry.finishedAs = outcome
    entry.active = false
    unpark(participant)

    // Rule 4: FAILED or CANCELLED releases the waiters, END cancels them.
    for (const other of [...awaiting]) {
      if (!shouldWaitForOther(other, participant)) {
        continue
      }
      unpark(other)
      if (outcome === GESTURE_STATE.END) {
        other.cancel()
        continue
      }
      tryActivate(other)
    }
  }

  return {
    relations,

    record: (participant) => {
      // A press is the only thing that puts a gesture back into play, so it is
      // also where the previous interaction's leftovers go.
      sweepFinished()
      const existing = entries.get(participant)
      if (existing !== undefined) {
        existing.active = false
        existing.awaiting = false
        existing.finishedAs = null
        existing.activationIndex = Number.MAX_SAFE_INTEGER
        drop(awaiting, participant)
        return
      }
      entries.set(participant, {
        active: false,
        awaiting: false,
        activationIndex: Number.MAX_SAFE_INTEGER,
        finishedAs: null,
      })
      recorded.push(participant)
    },

    forget: (participant) => {
      entries.delete(participant)
      drop(recorded, participant)
      drop(awaiting, participant)
      relations.drop(participant.tag)
    },

    tryActivate,
    activated,
    finished,

    interactionLost: (participant) => {
      for (const other of [...recorded]) {
        if (other !== participant && entries.get(other)?.active === true) {
          other.cancel()
        }
      }
    },

    isAwaiting: (participant) => entries.get(participant)?.awaiting === true,

    activeTags: () =>
      recorded
        .filter((participant) => entries.get(participant)?.active === true)
        .map((participant) => participant.tag),

    reset: () => {
      entries.clear()
      recorded.length = 0
      awaiting.length = 0
      activationIndex = 0
      relations.reset()
    },
  }
}

/**
 * The process-wide loop, which is the right scope for it and needs saying
 * because the responder lock's scope is the question slice 3 had to answer.
 *
 * This registry has NO tree knowledge at all: it is keyed by handler tag and
 * a gesture enters it only when the interaction's pointer reaches it. That is
 * what makes the islands answer simple — see docs/api.md, "Relations across
 * `Root`s". A relation naming a gesture in another `Root` is expressible and
 * simply never has an occasion to apply, because a gesture in another `Root`
 * is never recorded during this interaction. In particular it does not
 * deadlock: parking only ever happens against a gesture that is live in the
 * interaction under way.
 */
export const gestureOrchestrator = createOrchestrator()
