// Where state lives: settings and pet stats in $.store across sessions; chat and autopilot state in $.state,
// so a hot reload (session.start again) picks up where it left off.
import { test, expect } from 'claude-code/testing'
import { world } from './world'

test('settings and pet stats are saved under their own keys, without the chat', async ($, on) => {
  const w = world(on, { model: ['hi there'] })
  await w.start($)
  await w.talk($, 'hello')
  const settings: any = w.store.settings
  const pet: any = w.store.pet
  expect(settings.persona).toBe('cheerful')
  expect(settings.autoRelay).toBe(true)
  expect(pet.affection).toBe(1)
  expect(settings.chat).toBeUndefined()
  expect(pet.chat).toBeUndefined()
  expect(w.store.stats).toBeUndefined()
})

test('legacy stats are migrated, and the old chat is not carried into the new session', async ($, on) => {
  const w = world(on, { saved: { persona: 'zen', affection: 7, chat: [{ who: 'you', text: 'old secret chat' }] }, model: ['hi'] })
  await w.start($)
  await w.talk($, 'hello')
  expect((w.store.settings as any).persona).toBe('zen')
  expect((w.store.pet as any).affection).toBe(8)
  expect(w.rec.prompts[0]).not.toContain('old secret chat')
})

test('saved settings are read back in a new session', async ($, on) => {
  const w = world(on, { store: { settings: { persona: 'pirate', autoRelay: false, autoRelayDefaultV: 2 }, pet: { xp: 100 } }, model: ['ok\nRELAY: rename foo to bar'] })
  await w.start($)
  await w.talk($, 'rename')
  expect(w.rec.systems[0]).toContain('pirate parrot')
  expect(w.rec.submits.some((s) => s.includes('rename foo to bar'))).toBe(false)   // auto-relay stayed off
})

test('a hot reload keeps the session: earlier requests still reach the review', async ($, on) => {
  const w = world(on, { model: ['ok\nINTENT: x\nVERDICT: done'] })
  await w.start($)
  await $.prompt.submit({ text: 'build the CSV exporter', wait: false, origin: { kind: 'composer' } })
  await $.session.start({ cwd: '/Users/tester/proj', surface: 'terminal', isInteractive: true })   // what a reload fires
  await w.clock.advance(20)
  await w.turn($, 'and add tests', 'I started, next steps remain.')
  const review = w.rec.prompts.find((p) => p.includes("Review Claude's latest turn")) ?? ''
  expect(review).toContain('build the CSV exporter')
})
