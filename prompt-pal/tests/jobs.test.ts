// Model calls run as jobs: /buddy stop cancels the running one between steps.
import { test, expect } from 'claude-code/testing'
import { world, toolCall } from './world'

test('/buddy stop during a tool step ends the job without another model call', async ($, on) => {
  let w: ReturnType<typeof world>
  w = world(on, {
    model: [toolCall('grep', { pattern: 'x' }), 'this answer must not be asked for'],
    onProcess: async () => { await w.command($, 'stop'); await w.clock.advance(20) },
  })
  await w.start($)
  await w.talk($, 'look for x')
  expect(w.rec.prompts.length).toBe(1)
  expect(w.rec.toasts).toContain('Bit stopped')
})

test('a stopped job does not stop the next one', async ($, on) => {
  let w: ReturnType<typeof world>
  let first = true
  w = world(on, {
    model: [toolCall('grep', { pattern: 'x' }), 'second talk answer'],
    onProcess: async () => { if (first) { first = false; await w.command($, 'stop'); await w.clock.advance(20) } },
  })
  await w.start($)
  await w.talk($, 'look for x')
  await w.talk($, 'hello again')
  expect(w.rec.prompts.length).toBe(2)
})
