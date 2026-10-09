// The band and the pane, drawn on terminal and desktop: what they show and what their buttons do.
import { test, expect } from 'claude-code/testing'
import { world, toolCall } from './world'

const paneProps = { title: 'Bit', isFocused: true, bodyColumns: 100, placement: 'dock' } as any
const bandProps = { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: {}, view: {} } as any

for (const surface of ['terminal', 'desktop'] as const) {
  test(surface + ': the pane shows stats and its buttons work', async ($, on) => {
    const w = world(on, { model: [] })
    await w.start($)
    const ui: any = await $.ui.mount({ plugin: 'prompt-pal', surface, component: 'Pane', props: paneProps, requestId: 'prompt-pal' } as any)
    expect(await ui.find({ text: /energy/ })).toBeDefined()
    expect(await ui.find({ text: '♥ 0' })).toBeDefined()
    await ui.press({ key: 'pet' })
    expect(await ui.find({ text: '♥ 1' })).toBeDefined()
    await ui.press({ key: 'chatty' })
    expect(await ui.find({ key: 'chatty', text: /chatty/ })).toBeDefined()
    await ui.press({ key: 'auto-relay' })
    expect(await ui.find({ key: 'auto-relay', text: /ask first/ })).toBeDefined()
  })

  test(surface + ': typing in the pane talks to Bit', async ($, on) => {
    const w = world(on, { model: ['hello yourself'] })
    await w.start($)
    const ui: any = await $.ui.mount({ plugin: 'prompt-pal', surface, component: 'Pane', props: paneProps, requestId: 'prompt-pal' } as any)
    await ui.input({ key: 'talk', text: 'hello Bit' })
    await w.clock.advance(20)
    await w.clock.settle()
    expect(w.rec.prompts[0]).toContain('hello Bit')
    await ui.redraw()
    expect(await ui.find({ text: /hello yourself/ })).toBeDefined()
  })

  test(surface + ': the band shows Bit and a pending relay with send/drop', async ($, on) => {
    const w = world(on, { model: ['ok\nRELAY: git push to origin'] })
    await w.start($)
    await w.talk($, 'push it')          // irreversible: held for the user
    const band: any = await $.ui.mount({ plugin: 'prompt-pal', surface, component: 'AbovePrompt', props: bandProps } as any)
    expect(await band.find({ text: /Bit/ })).toBeDefined()
    expect(await band.find({ key: 'relay-send' })).toBeDefined()
    await band.press({ key: 'relay-send' })
    expect(w.rec.submits.some((s) => s.includes('git push to origin'))).toBe(true)
    expect(await band.find({ key: 'relay-send' })).toBeUndefined()
  })
}

test('idle, Bit redraws only now and then', async ($, on) => {
  let redraws = 0
  on('ui.invalidate', async () => { redraws += 1; return { value: undefined } })
  const w = world(on, { model: [] })
  await w.start($)
  redraws = 0
  await w.clock.advance(12_000)      // 30 ticks
  expect(redraws).toBeLessThanOrEqual(3)
})

test('while Claude works, Bit animates every tick', async ($, on) => {
  let redraws = 0
  on('ui.invalidate', async () => { redraws += 1; return { value: undefined } })
  const w = world(on, { model: [] })
  await w.start($)
  await $.turn.start({ text: 'go', turnId: 'busy' })
  redraws = 0
  await w.clock.advance(4_000)       // 10 ticks
  expect(redraws).toBeGreaterThanOrEqual(10)
})
