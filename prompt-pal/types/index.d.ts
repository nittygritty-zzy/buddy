// prompt-pal's $.state contract: this session's state, written by the mod and read back after a hot reload.

export type ChatLine = { who: string; text: string }
export type Relay = { target: string; text: string; web?: boolean }
// The autopilot state machine's state (hooks/lib/autopilot.ts)
export type Autopilot = {
  followUps: number          // follow-ups sent since the user last spoke
  lastRelay: string          // the last follow-up, to catch Bit asking for the same thing again
  lastSig: string | null     // working-tree fingerprint after the last reviewed turn
  lastAnswer: string         // Claude's answer in the last reviewed turn
  stillTurns: number         // Bit turns in a row without progress
  errorTurns: number         // Bit turns in a row that ended in errors
  bitSubmits: string[]       // texts Bit submitted that haven't started a turn yet
  bitTurn: boolean           // the running turn was started by Bit
}

export type Session = {
  chat: ChatLine[]
  lastPrompt: string
  userRequests: string[]
  intent: string
  intentWhispered: string
  intentWeb: boolean
  ap: Autopilot
  openQuestion: string
  lastVerdict: string
  lastRemark: string
  lastRemarkAt: number
  lastRemarkWeb: boolean
  remarkWhispered: boolean
  pendingRelay: Relay | null
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-pal': { session: Session }
  }
}
