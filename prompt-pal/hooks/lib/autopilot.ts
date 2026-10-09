// Autopilot as a pure state machine: step(state, event) -> [state, effects].
// register.js feeds it what happened (prompts, turns, measurements, review verdicts) and carries out the effects.
import { similar } from './text'
import type { Autopilot } from '../../types'

export type { Autopilot }

export const MAX_FOLLOW_UPS = 15   // hard cap on Bit -> Claude follow-ups in a row
export const STALL_TURNS = 2       // Bit turns in a row without progress, or with errors, before pausing


export type Event =
  | { type: 'user-prompt' }                                        // the user spoke: a new chain may start
  | { type: 'bit-sent'; text: string }                             // Bit submitted this text (or another plugin rewrote it to this)
  | { type: 'send-failed'; text: string }
  | { type: 'turn-start'; text: string }
  | { type: 'turn-complete'; aborted: boolean }
  | { type: 'measured'; startedByBit: boolean; sig: string | null; usedTools: number; answer: string; failed: boolean }
  | { type: 'verdict'; verdict: string; relay: string }

export type Effect =
  | { type: 'review'; startedByBit: boolean }                      // run the review for this turn
  | { type: 'relay'; text: string }                                // send this follow-up to Claude
  | { type: 'end'; followUps: number; reason: string }             // the chain is over: '' = finished, else why it paused

const fresh = { followUps: 0, lastRelay: '', lastSig: null, lastAnswer: '', stillTurns: 0, errorTurns: 0 }

export function initial(): Autopilot {
  return { ...fresh, bitSubmits: [], bitTurn: false }
}

// Why autopilot should hand back to the user instead of sending this follow-up ('' = keep going)
export function stallReason(s: Autopilot, relay = ''): string {
  if (s.followUps >= MAX_FOLLOW_UPS) return 'that was ' + s.followUps + ' follow-ups in a row'
  if (s.stillTurns >= STALL_TURNS) return 'nothing in the repo changed in the last ' + s.stillTurns + ' rounds'
  if (s.errorTurns >= STALL_TURNS) return 'Claude hit errors ' + s.errorTurns + ' rounds in a row'
  if (relay && s.lastRelay && similar(relay, s.lastRelay)) return 'I was about to ask for the same thing again'
  return ''
}

// Review Bit's own turns always; the user's when Claude changed something or the answer looks unfinished
const CHANGING_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit|Bash)$/
const UNFINISHED_RE = /\?\s*$|next steps?|todo|not (yet|done)|still (fail|broken)|fail(s|ed|ing)?\b|error|remaining|left to do/i
export function needsReview(startedByBit: boolean, toolsUsed: string[], answer: string): boolean {
  if (startedByBit) return true
  if (toolsUsed.some((t) => CHANGING_TOOLS.test(t))) return true
  return UNFINISHED_RE.test(answer.slice(-600))
}

const end = (s: Autopilot, reason: string): [Autopilot, Effect[]] =>
  [{ ...s, ...fresh }, [{ type: 'end', followUps: s.followUps, reason }]]

export function step(s: Autopilot, e: Event): [Autopilot, Effect[]] {
  switch (e.type) {
    case 'user-prompt':
      return [{ ...s, ...fresh }, []]
    case 'bit-sent':
      return [{ ...s, bitSubmits: [...s.bitSubmits, e.text].slice(-5) }, []]
    case 'send-failed':
      return [{ ...s, bitSubmits: s.bitSubmits.filter((t) => t !== e.text) }, []]
    case 'turn-start': {
      // A turn is Bit's when it starts from a text Bit submitted: exact, or wrapped by the engine
      const mine = s.bitSubmits.find((t) => t === e.text) ?? s.bitSubmits.find((t) => e.text.includes(t))
      return [{ ...s, bitTurn: mine !== undefined, bitSubmits: s.bitSubmits.filter((t) => t !== mine) }, []]
    }
    case 'turn-complete':
      return e.aborted ? [{ ...s, ...fresh, bitTurn: false }, []] : [{ ...s, bitTurn: false }, []]
    case 'measured': {
      let next = { ...s, lastSig: e.sig, lastAnswer: e.answer }
      if (e.startedByBit) {
        // No progress: the repo didn't move, and Claude either did nothing or said the same thing again.
        // A round that only runs tests and reports new results still counts as progress.
        const sameRepo = e.sig !== null && e.sig === s.lastSig
        const idle = e.usedTools === 0 || (s.lastAnswer !== '' && similar(e.answer, s.lastAnswer))
        next = { ...next, stillTurns: sameRepo && idle ? s.stillTurns + 1 : 0, errorTurns: e.failed ? s.errorTurns + 1 : 0 }
        if (next.followUps >= MAX_FOLLOW_UPS) return end(next, stallReason(next))
      }
      return [next, [{ type: 'review', startedByBit: e.startedByBit }]]
    }
    case 'verdict': {
      if (e.verdict === 'follow_up' && e.relay) {
        const why = stallReason(s, e.relay)
        if (why) return end(s, why)
        return [{ ...s, followUps: s.followUps + 1, lastRelay: e.relay }, [{ type: 'relay', text: e.relay }]]
      }
      if (s.followUps > 0) return end(s, e.verdict === 'ask_user' ? 'I need your call on something' : '')
      return [s, []]
    }
  }
}
