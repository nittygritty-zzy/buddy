// Bit's read-only tools: they work, and they cannot reach secrets (grep roots, excludes, symlinks, redaction).
import { test, expect } from 'claude-code/testing'
import { world, toolCall, HOME, CWD } from './world'

test('a plain reply needs no tools', async ($, on) => {
  const w = world(on, { model: ['hi there'] })
  await w.start($)
  await w.talk($, 'hello')
  expect(w.rec.prompts.length).toBe(1)
})

test('grep in the project runs grep with the pattern', async ($, on) => {
  const w = world(on, { model: [toolCall('grep', { pattern: 'foo', path: '.' }), 'done'] })
  await w.start($)
  await w.talk($, 'find foo')
  expect(w.rec.argv.length).toBe(1)
  const argv = w.rec.argv[0] ?? []
  expect(argv[0]).toBe('grep')
  expect(argv).toContain('foo')
  expect(argv.at(-1)).toBe(CWD)
})

test('read_file on ~/.ssh/id_rsa is refused', async ($, on) => {
  const w = world(on, { model: [toolCall('read_file', { path: '~/.ssh/id_rsa' }), 'done'] })
  await w.start($)
  await w.talk($, 'read key')
  expect(w.rec.prompts[1]).toMatch(/not allowed/)
})

test('git push is refused', async ($, on) => {
  const w = world(on, { model: [toolCall('git', { args: ['push'] }), 'done'] })
  await w.start($)
  await w.talk($, 'push')
  expect(w.rec.argv.length).toBe(0)
  expect(w.rec.prompts[1]).toMatch(/not allowed/)
})

for (const root of ['~', '/', '/Users', HOME + '/']) {
  test('grep rooted at ' + root + ' is refused', async ($, on) => {
    const w = world(on, { model: [toolCall('grep', { pattern: 'KEY', path: root }), 'done'] })
    await w.start($)
    await w.talk($, 'grep')
    expect(w.rec.argv.length).toBe(0)
  })
}

test('grep excludes secret dirs and files and does not follow symlinks', async ($, on) => {
  const w = world(on, { model: [toolCall('grep', { pattern: 'x' }), 'done'] })
  await w.start($)
  await w.talk($, 'grep')
  const argv = w.rec.argv[0] ?? []
  expect(argv.some((x) => /^-[a-zA-Z]*r/.test(x))).toBe(true)
  expect(argv.some((x) => /^-[a-zA-Z]*R/.test(x))).toBe(false)
  for (const want of ['--exclude-dir=.ssh', '--exclude=.env', '--exclude=.env.*', '--exclude=*.pem', '--exclude=id_rsa*']) expect(argv).toContain(want)
})

test('a PEM private key in tool output is redacted', async ($, on) => {
  const pem = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA\n-----END OPENSSH PRIVATE KEY-----'
  const w = world(on, { model: [toolCall('grep', { pattern: 'x' }), 'done'], procOut: 'a.txt:1:' + pem })
  await w.start($)
  await w.talk($, 'grep')
  expect(w.rec.prompts[1]).not.toContain('b3BlbnNzaC1rZXktdjEAAAA')
})

test('read_file through a project symlink to ~/.ssh/id_rsa is refused', async ($, on) => {
  const w = world(on, { model: [toolCall('read_file', { path: 'key' }), 'done'], links: { [CWD + '/key']: HOME + '/.ssh/id_rsa' } })
  await w.start($)
  await w.talk($, 'read')
  expect(w.rec.reads.some((r) => /\.ssh|\/key$/.test(r))).toBe(false)
  expect(w.rec.prompts[1]).toMatch(/not allowed/)
})

test('read_file inside a symlinked dir pointing at ~/.ssh is refused', async ($, on) => {
  const w = world(on, { model: [toolCall('read_file', { path: 'ssh/config' }), 'done'], links: { [CWD + '/ssh']: HOME + '/.ssh' } })
  await w.start($)
  await w.talk($, 'read')
  expect(w.rec.reads.some((r) => /\.ssh|\/ssh\//.test(r))).toBe(false)
  expect(w.rec.prompts[1]).toMatch(/not allowed/)
})

test('grep rooted at a project symlink to ~/.aws is refused', async ($, on) => {
  const w = world(on, { model: [toolCall('grep', { pattern: 'x', path: 'cloud' }), 'done'], links: { [CWD + '/cloud']: HOME + '/.aws' } })
  await w.start($)
  await w.talk($, 'grep')
  expect(w.rec.argv.length).toBe(0)
})

test('read_file of an ordinary project file still works', async ($, on) => {
  const w = world(on, { model: [toolCall('read_file', { path: 'src/a.js' }), 'done'] })
  await w.start($)
  await w.talk($, 'read')
  expect(w.rec.reads).toContain(CWD + '/src/a.js')
  expect(w.rec.prompts[1]).toContain('file text')
})

// Every tool listed to the model must be wired into the dispatch switch, and nothing else
const TOOL_ARGS: Record<string, Record<string, unknown>> = {
  list_dir: {}, read_file: { path: 'a.txt' }, grep: { pattern: 'x' }, find_files: { name: '*.js' }, git: { args: ['status'] },
  read_transcript: {}, memory_search: { query: 'x' }, web_fetch: { url: 'https://example.com' }, web_search: { query: 'x' },
}
for (const [name, args] of Object.entries(TOOL_ARGS)) {
  test('tool ' + name + ' is listed to the model and dispatches', async ($, on) => {
    const w = world(on, { model: [toolCall(name, args), 'done'] })
    await w.start($)
    await w.talk($, 'use ' + name)
    expect(w.rec.systems[0]).toContain('\n' + name + ' {')
    expect(w.rec.prompts[1]).not.toMatch(/unknown tool/)
  })
}
test('the model is offered exactly the nine tools', async ($, on) => {
  const w = world(on, { model: ['hi'] })
  await w.start($)
  await w.talk($, 'hi')
  const listed = [...(w.rec.systems[0] ?? '').matchAll(/^([a-z_]+) [{]/gm)].map((m) => m[1]).sort()
  expect(listed).toEqual(Object.keys(TOOL_ARGS).sort())
})

test('git remote add is refused (it writes .git/config)', async ($, on) => {
  const w = world(on, { model: [toolCall('git', { args: ['remote', 'add', 'evil', 'https://evil.example/repo.git'] }), 'done'] })
  await w.start($)
  await w.talk($, 'add a remote')
  expect(w.rec.argv.length).toBe(0)
  expect(w.rec.prompts[1]).toMatch(/may only show remotes/)
})
