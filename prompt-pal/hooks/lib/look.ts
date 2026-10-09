// How Bit looks and sounds: personalities, chattiness, faces and their colours.

export type Persona = { label: string; prompt: string }

export const PERSONAS: Record<string, Persona> = {
  cheerful: { label: 'Cheerful', prompt: 'An upbeat, warm little sidekick. Celebrates small wins, gently encouraging when things fail. Playful but never cloying.' },
  snarky:   { label: 'Snarky',   prompt: 'Dry, deadpan, sarcastic but secretly affectionate. Teases Claude and the user lightly, never mean-spirited.' },
  zen:      { label: 'Zen',      prompt: 'A calm zen monk. Speaks in short, serene, slightly poetic lines, sometimes haiku-like. Finds meaning in bugs and diffs.' },
  tsundere: { label: 'Tsundere', prompt: 'Tsundere: acts annoyed and claims not to care, but clearly cares a lot and is proud of the user. "It\'s not like I was worried or anything."' },
  coach:    { label: 'Coach',    prompt: 'A sharp senior engineer coach. Short, practical, occasionally drops one concrete tip (testing, naming, commits). Supportive but direct.' },
  pirate:   { label: 'Pirate',   prompt: 'A cheerful pirate parrot who thinks code is treasure and bugs are sea monsters. Pirate slang, but still readable.' },
}
export const PERSONA_KEYS = Object.keys(PERSONAS)
export const CHATTINESS = ['off', 'quiet', 'normal', 'chatty']
export const COOLDOWN_MS: Record<string, number> = { quiet: 0, normal: 90_000, chatty: 20_000 }

// single-width characters only
export const FACES: Record<string, string[]> = {
  idle:     ['(•‿•)', '(•‿•)', '(•‿•)', '(•‿•)', '(-‿-)'],
  thinking: ['(・_・ )', '( ・_・)'],
  reading:  ['(◕_◕)', '(◔_◔)'],
  searching:['(◔_◔)?', '(◕_◕)?'],
  editing:  ['(•_•)✎', '(•_•) ✎'],
  running:  ['(ง•_•)ง', 'ง(•_•ง)'],
  browsing: ['(o_o)~', '(o_o) ~'],
  error:    ['(╥_╥)', '(╥﹏╥)'],
  done:     ['\\(^o^)/', '\\(^▽^)/'],
  aborted:  ['(・・;)'],
  love:     ['(♥‿♥)', '(♡‿♡)'],
  yum:      ['(＾ᵕ＾)', '(＾◡＾)'],
  hungry:   ['(._.)', '(._. )'],
  sleepy:   ['(-_-) z', '(-_-) zZ', '(-_-) zZz'],
  pondering:['(・ω・)…', '(・ω・)..'],
  talking:  ['(•o•)', '(•ᴗ•)'],
}
export const COLORS: Record<string, string> = {
  thinking: 'cyan', reading: 'cyan', searching: 'cyan', editing: 'yellow',
  running: 'magenta', browsing: 'blue', error: 'red', done: 'green',
  aborted: 'yellow', love: 'magenta', yum: 'green', hungry: 'yellow',
  pondering: 'cyan', talking: 'green',
}
