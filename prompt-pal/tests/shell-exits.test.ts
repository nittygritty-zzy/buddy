// A shell command that ran and exited non-zero (grep with no match, a failing test run) is not Claude failing.
import { test, expect } from 'claude-code/testing'
import { world } from './world'
import { isSoftShellError, exitCodeOf, resultText } from '../hooks/lib/results'

const exit1 = { result: 'Exit code 1\n3 tests failed', text: 'Exit code 1\n3 tests failed', isError: true as const }
const followUp = (n: number) => 'go on\nINTENT: x\nVERDICT: follow_up\nRELAY: round ' + n + ' ' + ['fix the parser', 'fix the lexer', 'fix the printer', 'fix the docs'][n % 4]
const fromBit = (s: string[]) => s.filter((t) => t.includes("(the user's companion) says:"))

test('results helpers', () => {
  expect(isSoftShellError('Bash', exit1)).toBe(true)
  expect(exitCodeOf(exit1)).toBe('1')
  expect(isSoftShellError('Bash', { result: 'command not found: foo', text: 'command not found: foo', isError: true })).toBe(false)
  expect(isSoftShellError('Edit', exit1)).toBe(false)
  expect(isSoftShellError('Bash', { result: 'ok' })).toBe(false)
  expect(isSoftShellError('Bash', { deny: 'nope' })).toBe(false)
  expect(resultText({ result: [{ type: 'text', text: 'a' }, 'b'] })).toBe('a\nb')
})

test('failing test runs are not "Claude hit errors": autopilot keeps going', async ($, on) => {
  let n = 0
  const w = world(on, { model: [followUp(1), followUp(2), followUp(3), 'ok\nINTENT: x\nVERDICT: done'], git: () => 'M f' + n++, toolResult: (e) => (e.tool === 'Bash' ? exit1 : undefined) })
  const npmTest = [{ tool: 'Bash', command: 'npm test' }]
  await w.start($)
  await w.userTurn($, 'make the tests pass', 'I made a start, next steps remain.')
  await w.bitTurn($, 'Ran the tests: 3 still fail in parser.', 'answer', npmTest)
  await w.bitTurn($, 'Ran them again: 1 still fails in lexer.', 'answer', npmTest)
  await w.bitTurn($, 'All green now.', 'answer', npmTest)
  expect(fromBit(w.rec.submits).length).toBe(3)
  expect(w.rec.toasts.some((t) => /errors/.test(t))).toBe(false)
  const review = w.rec.prompts.find((p) => p.includes("Review Claude's latest turn") && p.includes('Tools Claude used: Bash')) ?? ''
  expect(review).toContain('Failed tool calls: 0. Shell commands that exited non-zero (often normal, e.g. which/grep/ls checks): 1.')
})

test('a real tool failure still counts', async ($, on) => {
  const w = world(on, { model: ['hmm\nINTENT: x\nVERDICT: done'], toolResult: (e) => (e.tool === 'Edit' ? { result: 'file not found', text: 'file not found', isError: true } : undefined) })
  await w.start($)
  await w.userTurn($, 'edit it', 'Tried, next steps remain.')
  await w.turn($, 'again', 'Tried again, next steps remain.', 'answer', [{ tool: 'Edit', file_path: '/p/a.ts' }])
  expect(w.rec.prompts.at(-1)).toContain('Failed tool calls: 1.')
})
