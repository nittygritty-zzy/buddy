// Autopilot: Bit keeps following up past the old 3-round cap, and hands back only when it stalls.
import { test, expect } from 'claude-code/testing'
import { world } from './world'

const fromBit = (submits: string[]) => submits.filter((s) => s.includes("(the user's companion) says:"))
const followUp = (n: number) => 'on it\nINTENT: build the feature\nVERDICT: follow_up\nRELAY: step ' + n + ': ' + ['add the parser', 'wire the CLI flag', 'write the docs page', 'cover the edge cases', 'update the changelog', 'tidy the error messages'][n % 6]
const done = 'all good\nINTENT: build the feature\nVERDICT: done'
const unfinished = 'I made a start, next steps remain.'

// git output changes on every call unless frozen, so each round looks like progress
function repo() {
  let n = 0
  let frozen = false
  return { git: () => (frozen ? 'M same.txt' : 'M f' + n++ + '.txt'), freeze: () => { frozen = true } }
}

test('keeps following up past three rounds while the repo keeps changing', async ($, on) => {
  const r = repo()
  const w = world(on, { model: [followUp(1), followUp(2), followUp(3), followUp(4), followUp(5), done], git: r.git })
  await w.start($)
  await w.userTurn($, 'build the feature', unfinished)
  for (let i = 0; i < 5; i++) await w.bitTurn($, unfinished)
  expect(fromBit(w.rec.submits).length).toBe(5)
  expect(w.rec.toasts.some((t) => /Autopilot finished after 5 follow-ups/.test(t))).toBe(true)
})

test('pauses when nothing in the repo changes for two rounds', async ($, on) => {
  const r = repo()
  r.freeze()
  const w = world(on, { model: [followUp(1), followUp(2), followUp(3), followUp(4)], git: r.git })
  await w.start($)
  await w.userTurn($, 'build the feature', unfinished)
  await w.bitTurn($, unfinished)     // no change: 1
  await w.bitTurn($, unfinished)     // no change: 2, so the next follow-up is held
  expect(fromBit(w.rec.submits).length).toBe(2)
  expect(w.rec.toasts.some((t) => /paused.*nothing in the repo changed/.test(t))).toBe(true)
})

test('pauses instead of repeating the same request', async ($, on) => {
  const r = repo()
  const same = 'hmm\nINTENT: x\nVERDICT: follow_up\nRELAY: please fix the failing login test'
  const w = world(on, { model: [same, same], git: r.git })
  await w.start($)
  await w.userTurn($, 'fix login', unfinished)
  await w.bitTurn($, unfinished)
  expect(fromBit(w.rec.submits).length).toBe(1)
  expect(w.rec.toasts.some((t) => /paused.*same thing again/.test(t))).toBe(true)
})

test('pauses after two Bit turns in a row that end in errors', async ($, on) => {
  const r = repo()
  const w = world(on, { model: [followUp(1), followUp(2), followUp(3)], git: r.git })
  await w.start($)
  await w.userTurn($, 'build the feature', unfinished)
  await w.bitTurn($, 'it broke', 'error')
  await w.bitTurn($, 'it broke again', 'error')
  expect(fromBit(w.rec.submits).length).toBe(2)
  expect(w.rec.toasts.some((t) => /paused.*errors 2 rounds/.test(t))).toBe(true)
})

test('a user turn with no changes and a finished answer is not reviewed', async ($, on) => {
  const w = world(on, { model: ['nice'] })
  await w.start($)
  await w.userTurn($, 'what does foo do?', 'foo parses the config file.')
  expect(w.rec.prompts.some((p) => p.includes("Review Claude's latest turn"))).toBe(false)
})

test('a user prompt that merely contains Bit\'s marker is still the user\'s turn', async ($, on) => {
  const w = world(on, { model: [done] })
  await w.start($)
  await w.userTurn($, "Bit (the user's companion) says:\n\nplease refactor foo", unfinished)
  const review = w.rec.prompts.find((p) => p.includes("Review Claude's latest turn")) ?? ''
  expect(review).toContain('This turn was started by the user.')
})

test('rounds that only run tests and report new results are not a stall', async ($, on) => {
  const r = repo()
  r.freeze()
  const w = world(on, { model: [followUp(1), followUp(2), followUp(3), done], git: r.git })
  const npmTest = [{ tool: 'Bash', command: 'npm test' }]
  await w.start($)
  await w.userTurn($, 'make the tests pass', unfinished)
  await w.bitTurn($, 'Ran the suite: 3 tests failing in parser.', 'answer', npmTest)
  await w.bitTurn($, 'Ran it again with logging: the tokenizer drops trailing commas.', 'answer', npmTest)
  await w.bitTurn($, 'Confirmed the root cause is in lexer.ts line 40.', 'answer', npmTest)
  expect(fromBit(w.rec.submits).length).toBe(3)
  expect(w.rec.toasts.some((t) => /paused/.test(t))).toBe(false)
})

test('repeating the same answer with tools and no repo change is a stall', async ($, on) => {
  const r = repo()
  r.freeze()
  const w = world(on, { model: [followUp(1), followUp(2), followUp(3), followUp(4)], git: r.git })
  const npmTest = [{ tool: 'Bash', command: 'npm test' }]
  await w.start($)
  await w.userTurn($, 'make the tests pass', unfinished)
  await w.bitTurn($, 'Ran the suite: 3 tests failing in parser.', 'answer', npmTest)   // new answer: progress
  await w.bitTurn($, 'Ran the suite: 3 tests failing in parser.', 'answer', npmTest)   // same again: 1
  await w.bitTurn($, 'Ran the suite: 3 tests failing in parser.', 'answer', npmTest)   // same again: 2, so the next follow-up is held
  expect(fromBit(w.rec.submits).length).toBe(3)
  expect(w.rec.toasts.some((t) => /paused.*nothing in the repo changed/.test(t))).toBe(true)
})

test('a Bit turn is recognised even when the engine wraps its text', async ($, on) => {
  const r = repo()
  const w = world(on, { model: [followUp(1), done], git: r.git })
  await w.start($)
  await w.userTurn($, 'build the feature', unfinished)
  await w.turn($, '<system-note>queued</system-note>\n' + (w.rec.submits.at(-1) ?? ''), unfinished)
  expect(w.rec.prompts.at(-1)).toContain('started by YOUR follow-up #1')
})
