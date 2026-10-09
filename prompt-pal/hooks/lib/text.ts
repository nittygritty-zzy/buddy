// Small text helpers, and the token sets that memory recall and stall detection compare.

export const TEXT_MAX = 9500   // a Text child holds at most 10,000 characters

export const level = (xp: number): number => Math.floor(Math.sqrt(xp / 20)) + 1
export const basename = (p: unknown): string => (typeof p === 'string' ? p.split(/[\\/]/).pop() ?? '' : '')
export const shorten = (s: unknown, n = 40): string => {
  if (typeof s !== 'string') return ''
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}
export const bar = (value: number, max: number, width = 10): string => {
  const filled = Math.round((Math.max(0, Math.min(value, max)) / max) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
export const seconds = (ms: number): string => (ms < 60_000 ? Math.round(ms / 1000) + 's' : Math.round(ms / 60_000) + 'm')
export const clip = (t: string, n = TEXT_MAX): string => (t.length > n ? t.slice(0, n - 1) + '…' : t)
export const oneLine = (t: unknown): string => String(t || '').replace(/\s*\n+\s*/g, ' ⏎ ').trim()

const STOP = new Set('the and for with that this from have what your you are was were will can not but all any how why when where which who into about just like then than them they there their its our out use using make made also more most some such only very http https www com'.split(' '))

// Lowercase word tokens (and their _/- parts) minus stop words, plus CJK bigrams
export function tokens(text: unknown): Set<string> {
  const s = String(text || '').toLowerCase()
  const out = new Set<string>()
  for (const w of s.match(/[a-z0-9][a-z0-9_\-]{2,}/g) || []) {
    for (const part of w.split(/[_\-]/)) if (part.length > 2 && !STOP.has(part)) out.add(part)
    if (!STOP.has(w)) out.add(w)
  }
  const cjk = s.match(/[\u3400-\u9fff]+/g) || []
  for (const run of cjk) for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2))
  return out
}

// Near-duplicates: token Jaccard similarity of 0.8 or more. With under 3 tokens a side
// (short or number-heavy text like "step 1" / "step 2") compare the normalised text instead.
export function similar(a: string, b: string): boolean {
  const x = tokens(a), y = tokens(b)
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim()
  if (x.size < 3 || y.size < 3) return norm(a) === norm(b)
  let both = 0
  for (const t of x) if (y.has(t)) both += 1
  return both / (x.size + y.size - both) >= 0.8
}
