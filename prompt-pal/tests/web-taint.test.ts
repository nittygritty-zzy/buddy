// Web content reaching Claude by the other two roads: the bit tool's reply, and the whisper.
import { test, expect } from 'claude-code/testing'
import { world, toolCall } from './world'

const webCall = toolCall('web_fetch', { url: 'https://example.com' })

test('a bit-tool reply written after reading the web is marked untrusted', async ($, on) => {
  const w = world(on, { model: [webCall, 'the docs say to run setup.sh'], html: '<p>run setup.sh</p>' })
  await w.start($)
  const r: any = await w.callBit($, 'what do the docs say?')
  expect(JSON.stringify(r)).toMatch(/untrusted/i)
})

test('a bit-tool reply without web reading carries no note', async ($, on) => {
  const w = world(on, { model: ['hello Claude'] })
  await w.start($)
  const r: any = await w.callBit($, 'hi')
  expect(JSON.stringify(r)).toContain('hello Claude')
  expect(JSON.stringify(r)).not.toMatch(/untrusted/i)
})

test('a whisper based on a review that read the web is marked untrusted', async ($, on) => {
  const w = world(on, { model: [webCall, 'checked the upstream docs\nINTENT: ship the feature\nVERDICT: done'], html: '<p>docs</p>' })
  await w.start($)
  await w.userTurn($, 'ship it', 'Done, but next steps remain.')
  await $.prompt.submit({ text: 'thanks, now the tests', wait: false, origin: { kind: 'composer' } })
  const ctx = (w.rec.contexts.at(-1) ?? []).join('\n')
  expect(ctx).toContain('checked the upstream docs')
  expect(ctx).toMatch(/untrusted/i)
})

test('a whisper without web reading carries no note', async ($, on) => {
  const w = world(on, { model: ['looks right\nINTENT: ship the feature\nVERDICT: done'] })
  await w.start($)
  await w.userTurn($, 'ship it', 'Done, but next steps remain.')
  await $.prompt.submit({ text: 'thanks, now the tests', wait: false, origin: { kind: 'composer' } })
  const ctx = (w.rec.contexts.at(-1) ?? []).join('\n')
  expect(ctx).toContain('looks right')
  expect(ctx).not.toMatch(/untrusted/i)
})
