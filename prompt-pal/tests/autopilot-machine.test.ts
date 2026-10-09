// The autopilot state machine on its own: events in, state and effects out.
import { test, expect } from 'claude-code/testing'
import { initial, step, needsReview, MAX_FOLLOW_UPS, type Autopilot, type Event, type Effect } from '../hooks/lib/autopilot'

// Run events in order; return the final state and every effect
function run(events: Event[], from: Autopilot = initial()): [Autopilot, Effect[]] {
  let s = from
  const all: Effect[] = []
  for (const e of events) { const [n, fx] = step(s, e); s = n; all.push(...fx) }
  return [s, all]
}
const measured = (o: Partial<Extract<Event, { type: 'measured' }>> = {}): Event =>
  ({ type: 'measured', startedByBit: true, sig: 'same', usedTools: 0, answer: 'a', failed: false, ...o })
const followUp = (relay: string): Event => ({ type: 'verdict', verdict: 'follow_up', relay })

test('a Bit turn is recognised by exact or wrapped text, once', () => {
  const [s1] = run([{ type: 'bit-sent', text: 'Bit says: fix it' }, { type: 'turn-start', text: 'note\nBit says: fix it' }])
  expect(s1.bitTurn).toBe(true)
  expect(s1.bitSubmits).toEqual([])
  const [s2] = run([{ type: 'turn-start', text: 'Bit says: fix it' }], { ...s1, bitTurn: false })
  expect(s2.bitTurn).toBe(false)
})

test('a failed send is forgotten', () => {
  const [s] = run([{ type: 'bit-sent', text: 'x' }, { type: 'send-failed', text: 'x' }])
  expect(s.bitSubmits).toEqual([])
})

test('measured asks for a review and counts follow-ups through verdicts', () => {
  const [s, fx] = run([measured({ startedByBit: false }), followUp('step 1'), measured({ sig: 's1' }), followUp('step 2')])
  expect(fx.filter((f) => f.type === 'review').length).toBe(2)
  expect(fx.filter((f) => f.type === 'relay').map((f) => (f as any).text)).toEqual(['step 1', 'step 2'])
  expect(s.followUps).toBe(2)
})

test('two idle Bit turns on an unchanged repo pause the chain', () => {
  const [, fx] = run([measured({ startedByBit: false }), followUp('step 1'), measured(), followUp('step 2'), measured(), followUp('step 3')])
  const end = fx.find((f) => f.type === 'end') as any
  expect(end.reason).toMatch(/nothing in the repo changed in the last 2 rounds/)
  expect(end.followUps).toBe(2)
})

test('new answers with tools on an unchanged repo are progress', () => {
  const [, fx] = run([measured({ startedByBit: false }), followUp('a'), measured({ usedTools: 1, answer: 'three tests fail in parser' }), followUp('b'),
    measured({ usedTools: 1, answer: 'the tokenizer drops trailing commas' }), followUp('c')])
  expect(fx.some((f) => f.type === 'end')).toBe(false)
})

test('two failed Bit turns pause the chain', () => {
  const [, fx] = run([measured({ startedByBit: false }), followUp('a'), measured({ sig: '1', failed: true }), followUp('b'), measured({ sig: '2', failed: true }), followUp('c')])
  expect((fx.find((f) => f.type === 'end') as any).reason).toMatch(/errors 2 rounds/)
})

test('a near-duplicate follow-up pauses instead of being sent', () => {
  const [, fx] = run([followUp('please fix the failing login test'), measured({ sig: '1' }), followUp('please fix the failing login test now')])
  expect(fx.filter((f) => f.type === 'relay').length).toBe(1)
  expect((fx.find((f) => f.type === 'end') as any).reason).toMatch(/same thing again/)
})

test('the hard cap ends the chain before another review', () => {
  const capped: Autopilot = { ...initial(), followUps: MAX_FOLLOW_UPS }
  const [s, fx] = step(capped, measured({ sig: 'new' }))
  expect(fx).toEqual([{ type: 'end', followUps: MAX_FOLLOW_UPS, reason: 'that was 15 follow-ups in a row' }])
  expect(s.followUps).toBe(0)
})

test('done after follow-ups finishes the chain; done with none says nothing', () => {
  const [, fx1] = run([followUp('a'), { type: 'verdict', verdict: 'done', relay: '' }])
  expect(fx1.at(-1)).toEqual({ type: 'end', followUps: 1, reason: '' })
  const [, fx2] = run([{ type: 'verdict', verdict: 'done', relay: '' }])
  expect(fx2).toEqual([])
})

test('ask_user mid-chain pauses with a reason', () => {
  const [, fx] = run([followUp('a'), { type: 'verdict', verdict: 'ask_user', relay: '' }])
  expect((fx.at(-1) as any).reason).toMatch(/your call/)
})

test('the user speaking or an abort resets the chain', () => {
  const [s1] = run([followUp('a'), followUp('b'), { type: 'user-prompt' }])
  expect(s1.followUps).toBe(0)
  const [s2] = run([followUp('a'), { type: 'turn-complete', aborted: true }])
  expect(s2.followUps).toBe(0)
})

test('needsReview', () => {
  expect(needsReview(true, [], 'all done.')).toBe(true)
  expect(needsReview(false, ['Edit'], 'all done.')).toBe(true)
  expect(needsReview(false, ['Read'], 'foo parses config.')).toBe(false)
  expect(needsReview(false, [], 'Done. Next steps: add docs')).toBe(true)
})
