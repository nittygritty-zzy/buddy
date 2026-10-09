// Reading Claude's tool results: a shell command that ran and exited non-zero is not a failure.
import type { ToolCallResult } from 'claude-code'

// Text of a tool result: its text, or a string / text-block result
export function resultText(result: ToolCallResult | undefined): string {
  if (!result || 'deny' in result && result.deny) return ''
  if (typeof result.text === 'string') return result.text
  const r: unknown = result.result
  if (typeof r === 'string') return r
  if (Array.isArray(r)) return r.map((b) => (typeof b === 'string' ? b : b && typeof b === 'object' && 'text' in b ? String(b.text ?? '') : '')).join('\n')
  return ''
}

// `which x`, grep with no match, ls on a missing path, a failing test run: ran fine, exited non-zero
export function isSoftShellError(tool: string, result: ToolCallResult | undefined): boolean {
  if (!/^(Bash|PowerShell)$/.test(tool) || !result || 'deny' in result && result.deny || !result.isError) return false
  const t = resultText(result)
  return !t || /^\s*Exit code \d+/.test(t)
}

export function exitCodeOf(result: ToolCallResult | undefined): string {
  return /^\s*Exit code (\d+)/.exec(resultText(result))?.[1] ?? ''
}
