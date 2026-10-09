// Test world for prompt-pal: answers every $ call the mod makes, records what it did.
import { mock } from 'claude-code/testing'

export const HOME = '/Users/tester'
export const CWD = '/Users/tester/proj'

export type WorldOptions = {
  saved?: Record<string, unknown>       // legacy: what $.store holds under 'stats' at session start
  store?: Record<string, unknown>       // what $.store holds at session start, by key
  model?: string[]                      // replies $.model.complete gives, in order; then it stops answering
  procOut?: string                      // stdout of every $.process.run
  html?: string                         // body of every $.http.fetch
  links?: Record<string, string>        // symlinks: { '/abs/link': '/abs/target' }; paths under a link resolve through it
  onProcess?: (argv: string[]) => Promise<void> | void   // runs inside every $.process.run, before it answers
  git?: (argv: string[]) => string      // stdout for git commands Bit runs itself (default: '')
  agents?: Array<{ id: string; type: string; description: string; status: string }>   // what $.agent.list() returns
  messages?: Array<{ role: 'user' | 'assistant'; text: string; toolUses: Array<{ tool_use_id: string; tool: string; input: Record<string, unknown> }> }>   // the session transcript
  entries?: Array<{ name: string; kind: 'file' | 'dir' | 'other' }>   // what $.fs.list returns for any directory
}

export type Rec = { argv: string[][]; prompts: string[]; toasts: string[]; submits: string[]; reads: string[]; contexts: string[][]; systems: string[]; requests: any[]; sends: Array<{ agentId: string; text: string }> }

const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const origin = { kind: 'composer' } as const

export function world(on: any, opts: WorldOptions = {}) {
  const rec: Rec = { argv: [], prompts: [], toasts: [], submits: [], reads: [], contexts: [], systems: [], requests: [], sends: [] }
  const queue = [...(opts.model ?? [])]
  const links = opts.links ?? {}
  let turns = 0
  const clock = mock.clock(on)
  mock.env(on, { HOME, PWD: CWD })

  // events the mod passes on with next(e): the engine's part
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }))
  on('prompt.submit', async (_$: any, e: any) => { rec.submits.push(e.text); rec.contexts.push([...(e.context ?? [])]); return { text: e.text } })
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }))
  on('tool.call', async () => ({ result: 'ok', text: 'ok' }))   // Claude's own tools: they just succeed
  on('ui.render', async ($: any, e: any) => $.ui.resolve(e).Box({ children: [] }))   // nothing else draws

  // calls the mod makes on $: a hook answers with { value }
  const answer = (name: string, fn: (e: any) => unknown) => on(name, async (_$: any, e: any) => ({ value: await fn(e) }))
  // $.store, kept here so tests can read what the mod saved
  const store: Record<string, unknown> = { ...(opts.store ?? {}), ...(opts.saved ? { stats: opts.saved } : {}) }
  answer('store.get', (e) => (e.key in store ? JSON.parse(JSON.stringify(store[e.key])) : undefined))
  answer('store.set', (e) => { store[e.key] = JSON.parse(JSON.stringify(e.value)) })
  answer('store.delete', (e) => { delete store[e.key] })
  answer('store.keys', () => Object.keys(store))
  answer('tool.register', (e) => ({ tool: e.name }))
  answer('command.register', (e) => ({ command: e.name }))
  answer('ui.toast', (e) => { rec.toasts.push(e.text) })
  answer('ui.log', () => {})
  answer('ui.open', () => ({ isPlaced: true }))
  answer('agent.list', () => opts.agents ?? [])
  on('session.send', async (_$: any, e: any) => { rec.sends.push({ agentId: e.to, text: e.text }); return { isDelivered: true } })   // an event: plain result; the engine spells { agentId } as the id string
  answer('session.cwd', () => CWD)
  answer('session.messages', () => opts.messages ?? [])
  answer('fs.read', (e) => { rec.reads.push(e.path); return 'file text' })
  answer('fs.list', () => (opts.entries ?? []).map((x) => ({ ...x, size: x.kind === 'file' ? 10 : 0, mtimeMs: 0, isLink: false })))
  answer('fs.stat', (e) => {
    for (const [l, t] of Object.entries(links)) {
      if (e.path === l || e.path.startsWith(l + '/')) {
        return { kind: 'file', size: 1, mtimeMs: 0, isLink: e.path === l, ...(e.resolve ? { realPath: t + e.path.slice(l.length) } : {}) }
      }
    }
    return { kind: 'file', size: 1, mtimeMs: 0, isLink: false, ...(e.resolve ? { realPath: e.path } : {}) }
  })
  answer('process.run', async (e) => {
    rec.argv.push([...e.argv])
    if (opts.onProcess) await opts.onProcess([...e.argv])
    if (e.argv[0] === 'git' && opts.git) return { exitCode: 0, stdout: opts.git([...e.argv]), stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    return { exitCode: 0, stdout: opts.procOut ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
  })
  answer('http.fetch', () => ({ status: 200, ok: true, headers: { 'content-type': 'text/html' }, text: opts.html ?? '' }))
  answer('model.complete', (e) => {
    rec.prompts.push(e.prompt)
    rec.systems.push(e.system ?? '')
    rec.requests.push(e)
    const text = queue.shift()
    return text == null ? { isAnswered: false, reason: 'empty-reply', usage } : { isAnswered: true, text, usage }
  })

  return {
    rec,
    clock,
    store,
    async start($: any) {
      await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
      await clock.advance(20)
    },
    // /buddy <text>, then let the delayed dispatch and its model/tool calls run
    async command($: any, text: string) {
      await $.command.run({ command: 'buddy', args: text, origin, presentation: { isFullscreen: false, columns: 100 } })
    },
    async talk($: any, text: string) {
      await $.command.run({ command: 'buddy', args: text, origin, presentation: { isFullscreen: false, columns: 100 } })
      await clock.advance(20)
      await clock.settle()
    },
    // a user turn: prompt, start, complete, then the review Bit runs 50ms later
    // Claude (or an agent) calling the bit tool; resolves to what the tool answered
    async callBit($: any, message: string) {
      const r = await $.tool.call({ tool: 'mcp__prompt-pal__bit', message })
      await clock.settle()
      return r
    },
    async userTurn($: any, text: string, answer: string) {
      await $.prompt.submit({ text, wait: false, origin })
      await this.turn($, text, answer)
    },
    // the turn Claude runs for Bit's latest submitted follow-up
    async bitTurn($: any, answer: string, reason = 'answer', tools: Array<Record<string, unknown>> = []) {
      await this.turn($, rec.submits.at(-1) ?? '', answer, reason, tools)
    },
    // tools: calls Claude makes during the turn, e.g. { tool: 'Bash', command: 'npm test' }
    async turn($: any, text: string, answer: string, reason = 'answer', tools: Array<Record<string, unknown>> = []) {
      const turnId = 't' + ++turns
      await $.turn.start({ text, turnId })
      for (const t of tools) await $.tool.call(t)
      await $.turn.complete({ answer, durationMs: 10, isAborted: false, turnId, reason })
      await clock.advance(100)
      await clock.settle()
    },
  }
}

export const toolCall = (name: string, args: Record<string, unknown>) => 'checking\nTOOL ' + JSON.stringify({ name, args })
