// The text protocol Bit's model replies in: a TOOL line, a RELAY line, and the review's tagged lines.

export type ToolCall = { narration: string; name: string; args: Record<string, unknown>; parseError?: string }
export type Relay = { target: string; text: string; web?: boolean }
export type Review = { remark: string; intent: string; verdict: '' | 'done' | 'follow_up' | 'ask_user'; relay: string; ask: string }

// Split a model reply into narration + an optional tool request
export function parseToolCall(text: string): ToolCall | null {
  const m = /(^|\n)\s*TOOL\b:?\s*([\s\S]*)$/.exec(text)
  if (!m) return null
  const narration = text.slice(0, m.index).trim()
  try {
    const body = (m[2] ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    const j = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1))
    return { narration, name: String(j.name || ''), args: j.args && typeof j.args === 'object' ? j.args : {} }
  } catch (err) {
    return { narration, name: '', args: {}, parseError: (err instanceof Error && err.message) || 'bad JSON' }
  }
}

// Strip quotes the model sometimes wraps a whole reply in
export function cleanReply(text: unknown): string {
  return String(text || '').trim().replace(/^["'「『]+(?=[\s\S]*["'」』]$)/, '').replace(/(?<=^[\s\S]*)["'」』]+$/, '').trim()
}

// The review reply: a remark for the user, then INTENT / VERDICT / RELAY / ASK lines
export function parseReview(text: string): Review {
  const re = /^\s*(INTENT|VERDICT|RELAY|ASK)\s*:\s*/gm
  const out = { remark: '', intent: '', verdict: '', relay: '', ask: '' }
  const marks: Array<{ tag: string; start: number; body: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) marks.push({ tag: m[1] ?? '', start: m.index, body: m.index + m[0].length })
  out.remark = (marks.length ? text.slice(0, marks[0]!.start) : text).trim()
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1]!.start : text.length
    const val = text.slice(mk.body, end).trim().replace(/^`+|`+$/g, '').trim()
    const key = mk.tag.toLowerCase() as 'intent' | 'verdict' | 'relay' | 'ask'
    out[key] = val
  })
  const verdict = (out.verdict.toLowerCase().match(/follow_up|ask_user|done/) || [''])[0] as Review['verdict']
  return { ...out, verdict }
}

// Pull a RELAY line out of a reply. Returns [visibleText, relay|null]
export function extractRelay(reply: string): [string, Relay | null] {
  const m = /(^|\n)\s*RELAY(?:\s*@(\S+))?\s*:\s*([\s\S]+)$/.exec(reply)
  if (!m) return [reply, null]
  const target = (m[2] || 'claude').toLowerCase()
  const text = (m[3] ?? '').trim().replace(/^`+|`+$/g, '').trim()
  return [reply.slice(0, m.index).trim(), text ? { target, text } : null]
}
