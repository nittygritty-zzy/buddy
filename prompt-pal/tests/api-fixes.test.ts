// Bugs the strict TS conversion surfaced: each test pins the behaviour against the real API shapes.
import { test, expect } from 'claude-code/testing'
import { world, toolCall } from './world'

test('list_dir marks directories with a slash (the API says kind "dir")', async ($, on) => {
  const w = world(on, { model: [toolCall('list_dir', {}), 'done'], entries: [{ name: 'src', kind: 'dir' }, { name: 'a.txt', kind: 'file' }] })
  await w.start($)
  await w.talk($, 'list')
  expect(w.rec.prompts[1]).toContain('src/')
  expect(w.rec.prompts[1]).toContain('a.txt  (10 B)')
})

test('read_transcript names the tools Claude used (ToolUseSummary.tool)', async ($, on) => {
  const w = world(on, {
    model: [toolCall('read_transcript', {}), 'done'],
    messages: [{ role: 'assistant', text: 'edited it', toolUses: [{ tool_use_id: 'u1', tool: 'Edit', input: {} }] }],
  })
  await w.start($)
  await w.talk($, 'what happened')
  expect(w.rec.prompts[1]).toContain('assistant: edited it  [tools: Edit]')
})

test('@agents reaches agents listed by id/type/description', async ($, on) => {
  const w = world(on, { model: ['hello helpers'], agents: [{ id: 'a1', type: 'code-reviewer', description: 'reviews diffs', status: 'running' }] })
  await w.start($)
  await w.talk($, '@code-reviewer please check the diff')
  expect(w.rec.sends.length).toBe(1)
  expect(w.rec.sends[0]?.agentId).toBe('a1')
  expect(w.rec.sends[0]?.text).toContain('hello helpers')
})

test('the pane draws on mobile, which has no Input element', async ($, on) => {
  const w = world(on, { model: [] })
  await w.start($)
  const ui: any = await $.ui.mount({ plugin: 'prompt-pal', surface: 'mobile', component: 'Pane', props: { title: 'Bit', isFocused: true, bodyColumns: 60, placement: 'dock' }, requestId: 'prompt-pal' } as any)
  expect(await ui.find({ text: /energy/ })).toBeDefined()
  expect(await ui.find({ key: 'pet' })).toBeDefined()
  expect(await ui.find({ key: 'talk' })).toBeUndefined()
})
