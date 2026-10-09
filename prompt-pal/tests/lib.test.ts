// The pure modules on their own: protocol parsing, safety checks, text helpers.
import { test, expect } from 'claude-code/testing'
import { parseToolCall, parseReview, extractRelay, cleanReply } from '../hooks/lib/protocol'
import { DENY_PATH, redact, grepRootError, gitArgsError, relayHoldReason } from '../hooks/lib/guard'
import { tokens, similar, shorten, clip } from '../hooks/lib/text'

test('parseToolCall: a TOOL line, fenced JSON, and broken JSON', () => {
  expect(parseToolCall('just talking')).toBeNull()
  expect(parseToolCall('let me look\nTOOL {"name":"grep","args":{"pattern":"x"}}')).toEqual({ narration: 'let me look', name: 'grep', args: { pattern: 'x' } })
  expect(parseToolCall('TOOL: ```json\n{"name":"git","args":{"args":["log"]}}\n```')?.name).toBe('git')
  expect(parseToolCall('TOOL {"name": oops}')?.parseError).toBeDefined()
})

test('parseReview: remark, tags in any order, multi-line relay, verdict normalised', () => {
  const r = parseReview('Nice.\nVERDICT: Follow_Up please\nINTENT: ship it\nRELAY: line one\nline two\nASK: ')
  expect(r.remark).toBe('Nice.')
  expect(r.verdict).toBe('follow_up')
  expect(r.intent).toBe('ship it')
  expect(r.relay).toBe('line one\nline two')
  expect(parseReview('all good').verdict).toBe('')
})

test('extractRelay: target, backticks, and no relay', () => {
  expect(extractRelay('hi')).toEqual(['hi', null])
  expect(extractRelay('ok\nRELAY @agents: `run the tests`')).toEqual(['ok', { target: 'agents', text: 'run the tests' }])
  expect(extractRelay('ok\nRELAY: do it')[1]?.target).toBe('claude')
})

test('cleanReply strips wrapping quotes only', () => {
  expect(cleanReply('"hello"')).toBe('hello')
  expect(cleanReply('say "hi" now')).toBe('say "hi" now')
})

test('DENY_PATH: secret locations yes, ordinary files no', () => {
  for (const p of ['/u/.ssh/id_rsa', '/u/.aws/credentials', '/p/.env', '/p/.env.local', '/p/server.pem', '/p/id_ed25519.pub', '/u/.git-credentials']) expect(DENY_PATH.test(p)).toBe(true)
  for (const p of ['/p/src/env.ts', '/p/README.md', '/p/keys.md', '/p/.envrc-docs/x']) expect(DENY_PATH.test(p)).toBe(false)
})

test('redact: PEM blocks and known token formats', () => {
  expect(redact('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----')).toBe('[redacted private key]')
  expect(redact('key=ghp_abcdefghijklmnop')).toBe('key=[redacted]')
  expect(redact('nothing secret')).toBe('nothing secret')
})

test('grepRootError: / and home and above refused, project allowed', () => {
  expect(grepRootError('/', '/Users/me')).not.toBe('')
  expect(grepRootError('/Users', '/Users/me')).not.toBe('')
  expect(grepRootError('/Users/me', '/Users/me')).not.toBe('')
  expect(grepRootError('/Users/me/proj', '/Users/me')).toBe('')
  expect(grepRootError('/Users/meow', '/Users/me')).toBe('')
})

test('gitArgsError: read-only subcommands only', () => {
  for (const ok of [['status'], ['log', '-5'], ['diff', 'HEAD~1'], ['branch', '-a'], ['stash', 'list'], ['remote', '-v'], ['tag', '-l']]) expect(gitArgsError(ok)).toBe('')
  for (const bad of [['push'], ['commit', '-m', 'x'], ['branch', '-D', 'main'], ['branch', 'new'], ['stash', 'pop'], ['tag', 'v1'], ['log', '--output=/tmp/x'], ['diff', '--ext-diff'], ['remote', 'add', 'x', 'y'], ['remote', 'remove', 'origin'], ['remote', 'set-url', 'origin', 'x'], ['remote', 'rename', 'a', 'b'], ['remote', '-v', 'add'], ['-c', 'x=y']]) expect(gitArgsError(bad)).not.toBe('')
  for (const ok of [['remote'], ['remote', 'show', 'origin'], ['remote', 'get-url', 'origin'], ['remote', 'get-url', '--push', 'origin']]) expect(gitArgsError(ok)).toBe('')
})

test('relayHoldReason: irreversible always, risky only after the web', () => {
  expect(relayHoldReason({ target: 'claude', text: 'git push origin main' })).toMatch(/irreversible/)
  expect(relayHoldReason({ target: 'claude', text: 'run npm install left-pad' })).toBe('')
  expect(relayHoldReason({ target: 'claude', text: 'run npm install left-pad', web: true })).toMatch(/web/)
  expect(relayHoldReason({ target: 'claude', text: 'fix the parser test', web: true })).toBe('')
})

test('tokens and similar', () => {
  expect([...tokens('Fix the parser_test now')].sort()).toEqual(['fix', 'now', 'parser', 'parser_test', 'test'].sort())
  expect(tokens('修复测试').has('修复')).toBe(true)
  expect(similar('please fix the failing login test', 'please fix the failing login test now')).toBe(true)
  expect(similar('add the parser', 'write the docs page')).toBe(false)
  expect(similar('step 1', 'step 2')).toBe(false)
  expect(similar('Step 1 ', 'step  1')).toBe(true)
})

test('shorten and clip', () => {
  expect(shorten('a  b\nc', 40)).toBe('a b c')
  expect(shorten('abcdef', 4)).toBe('abc…')
  expect(clip('abcdef', 4)).toBe('abc…')
})
