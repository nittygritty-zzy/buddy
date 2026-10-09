// The auto-relay default migration: new default for fresh and untouched settings, explicit choices kept.
import { test, expect } from 'claude-code/testing'
import { world } from './world'

async function autoSends($: any, on: any, saved?: Record<string, unknown>) {
  const w = world(on, { saved, model: ['ok\nRELAY: rename foo to bar'] })
  await w.start($)
  await w.talk($, 'rename')
  return w.rec.submits.some((s) => s.includes('rename foo to bar'))
}

test('fresh install: auto-relay on', async ($, on) => {
  expect(await autoSends($, on)).toBe(true)
})

test('saved v2 settings with auto-relay off stay off', async ($, on) => {
  expect(await autoSends($, on, { autoRelay: false, autoRelayDefaultV: 2 })).toBe(false)
})

test('legacy save where the user turned auto-relay off: stays off', async ($, on) => {
  expect(await autoSends($, on, { autoRelay: false, userSet: { autoRelay: true } })).toBe(false)
})

test('legacy save without an explicit choice gets the new default (on)', async ($, on) => {
  expect(await autoSends($, on, { autoRelay: false })).toBe(true)
})
