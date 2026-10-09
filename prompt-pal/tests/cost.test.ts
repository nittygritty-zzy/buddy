// Cost: the fixed part of the system prompt and the growing tool-loop prefix are marked for the prompt cache;
// cheap lines ask for low effort.
import { test, expect } from 'claude-code/testing'
import { world, toolCall } from './world'

test('the fixed system block is cached and the changing one is not', async ($, on) => {
  const w = world(on, { model: ['hi'] })
  await w.start($)
  await w.talk($, 'hello')
  const blocks = w.rec.requests[0].systemBlocks ?? []
  expect(blocks.length).toBe(2)
  expect(blocks[0].cache).toBe(true)
  expect(blocks[0].text).toContain('Your personality')
  expect(blocks[1].cache).toBeFalsy()
  expect(blocks[1].text).toContain("The user's latest message")
})

test('a tool step resends the task and the work so far as cached blocks', async ($, on) => {
  const w = world(on, { model: [toolCall('grep', { pattern: 'x' }), 'done'] })
  await w.start($)
  await w.talk($, 'find x')
  const second = w.rec.requests[1].promptBlocks ?? []
  expect(second.length).toBe(3)
  expect(second[0].cache).toBe(true)
  expect(second[1].cache).toBe(true)
  expect(second[1].text).toContain('--- Your work so far ---')
  expect(second[2].cache).toBeFalsy()
})

test('an unprompted remark asks for low effort', async ($, on) => {
  const w = world(on, { model: ['nice work'] })
  await w.start($)
  await w.userTurn($, 'what does foo do?', 'foo parses the config file.')   // finished, no changes: a remark, not a review
  expect(w.rec.requests.length).toBe(1)
  expect(w.rec.requests[0].effort).toBe('low')
})

test('talking to Bit uses the default effort', async ($, on) => {
  const w = world(on, { model: ['hi'] })
  await w.start($)
  await w.talk($, 'hello')
  expect(w.rec.requests[0].effort).toBeUndefined()
})
