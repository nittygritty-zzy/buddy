# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Claude Code **mod** (plugin) marketplace containing one plugin, `prompt-pal`: a companion named "Bit" that renders in the band above the prompt and in a pane, reacts to Claude's tool calls and turns, reviews Claude's answers against the user's intent, and drives Claude on autopilot. It can also message Claude and subagents. Requires Claude Code v2.1.287+. Use the `plugin-authoring` skill for mod API details.

There is no build step or package manager. Everything is strict TypeScript, and the engine loads `.ts` directly. `prompt-pal/hooks/hooks.json` loads `hooks/register.ts`, which holds the event hooks, the session state and the UI. It imports pure modules from `hooks/lib/`. `docs/DESIGN.md` holds the refactor plan and the product decisions (full autopilot, pause only for major issues).

## Commands

```bash
claude plugin test ./prompt-pal                     # run all tests in prompt-pal/tests/*.test.ts
claude plugin validate ./prompt-pal                 # what the engine would refuse; also checks the $.state contract
npx -p typescript@5.6 tsc -p prompt-pal             # strict type-check of hooks, types and tests
claude plugin marketplace add <path-or-repo>        # marketplace name is "local-mods" (.claude-plugin/marketplace.json)
claude plugin install prompt-pal@local-mods
```

The API types are a pinned copy at `typings/claude-code-<version>.d.ts`, outside the plugin folder so they don't ship with it. When Claude Code updates, copy the newer file over it. The engine also writes its own copy to `prompt-pal/.claude-plugin/types/` (gitignored, and not included by the tsconfig, so the two never clash). After editing, run `/reload-plugins` in Claude Code (or start a new session), then `/buddy` to exercise it.

## Architecture

- **`hooks/lib/`** (pure, no `$`, unit-tested in `tests/lib.test.ts`):
  - `protocol.ts`: parses Bit's text replies (`TOOL {...}` line, `RELAY[ @target]:` line, review `INTENT/VERDICT/RELAY/ASK` lines).
  - `guard.ts`: the safety rules (`DENY_PATH`, `SECRET_DIRS/FILES`, `redact`, `grepRootError`, `gitArgsError`, `relayHoldReason`, `WEB_NOTE`).
  - `text.ts`: helpers plus `tokens()` / `similar()`, used by memory recall and stall detection.
  - `look.ts`: personas and faces.
- **`hooks/lib/autopilot.ts`**: the autopilot as a pure state machine. `step(state, event) → [state, effects]`, with events `user-prompt`, `bit-sent`, `turn-start`, `turn-complete`, `measured`, `verdict` and effects `review`, `relay`, `end`. `register.ts` feeds it through `apply()` and carries out the effects in `runEffects()`. Its state type `Autopilot` lives in the `$.state` contract `types/index.d.ts`.
- **Entry point**: `register: Register` in `register.ts` hooks `session.start`, `command.run`, `prompt.submit`, `session.receive`, `turn.start`, `turn.complete`, `tool.call`, and `ui.render` (`AbovePrompt` band; `Pane` built from `pane*()` section functions).
- **State**: module-level variables, with three kinds of persistence:
  - `$.store`: `settings` and `pet` keys, across sessions. A legacy `stats` key is migrated once.
  - `$.state` `prompt-pal.session`: chat, intent, requests, autopilot chain, pending relay. Its contract is `types/index.d.ts`. `restoreSession()` reads it back when `session.start` fires again after a hot reload.
  - Call `save($)` after changing either. Call `redraw($)` for anything the UI shows. The 400ms tick only redraws while animating (`busy`, running jobs, a timed mood); otherwise every `IDLE_TICKS`.
- **Model calls**: each `think()` is a job in `jobs`, with its own `AbortController`, `activity` and `thought`. `/buddy stop` aborts all of them. Tool steps come from `JOB_STEPS` per kind and effort from `JOB_EFFORT`. `systemBlocks()` splits the system prompt into a cached fixed block and a changing block. In tool loops the task and the work so far are sent as cached prompt blocks.
- **Tools**: the `TOOLS` table holds each tool's doc, mood, label and web flag. Dispatch must stay the static `callTool` switch, because `validate` refuses `$` passed to a function picked at run time. A test checks that the two match. To add a tool: write `tool_<name>`, add a `TOOLS` entry and a `callTool` case.
- **Safety boundary** (keep it intact; Bit never gets write or exec tools):
  - `resolvePath` applies `DENY_PATH` to the spelled path and again after following symlinks (`$.fs.stat` with `resolve`).
  - grep refuses roots at or above `$HOME` and excludes the secret dirs/files.
  - git allows only read-only forms (`gitArgsError`).
  - File tools are deliberately **not** limited to the project root.
- **Autopilot** (logic in `lib/autopilot.ts`):
  - `reviewTurn()` gets a verdict. `follow_up` → `proposeRelay` → `sendToClaude`. Auto-relay (default on) sends at once unless `relayHoldReason()` says to hold: irreversible asks, or risky asks written after a web tool ran (`meta.web`).
  - The chain ends with an `end` effect (announced by `announceEnd()`) when `stallReason()` fires: 15 follow-ups, `STALL_TURNS` Bit turns with an unchanged `progressSig` (git status + diff) where Claude was idle or repeated itself, repeated errors, or a near-duplicate relay.
  - Bit turns are recognised at `turn-start` against `bitSubmits` (exact match, or contained in the turn text), because a plugin's own `$.prompt.submit` skips its own `prompt.submit` hook.
  - User turns are reviewed only when `needsReview()` holds.
  - Web-tainted text reaching Claude another way (whisper context, `mcp__prompt-pal__bit` replies) gets `WEB_NOTE`.
- **Agents / memory**:
  - `/buddy @agents` uses `$.agent.list` and `$.session.send`. Claude and subagents reach Bit through the `mcp__prompt-pal__bit` tool (`answerCaller`).
  - `loadMemory()` reads, never writes, Claude Flow shared memory, `~/.claude/CLAUDE.md` and the project's auto memory.

## Tests

`prompt-pal/tests/world.ts` builds the test world:
- **Answering `$` calls**: every `$` call the mod makes reaches a test hook, which answers with `{ value }`. Events the mod passes on with `next(e)` (`session.start`, `prompt.submit`, `turn.*`, `tool.call`, `ui.render`) get a plain result.
- **Scripting**: model replies via `world(on, { model: [...] })`, a Bit tool step via `toolCall(name, args)`, git output via `git`, symlinks via `links`.
- **Clock**: the mod defers work with `$.clock.after`, so `talk()` / `userTurn()` / `bitTurn()` advance the mock clock and settle. The mod's own cooldowns use real `Date.now()`.
- **What you can read back**: `w.rec` and `w.store`.
- **UI**: UI tests mount the pane and band with `$.ui.mount` on both `terminal` and `desktop`.

Run the full suite after every change.

## Constraints

- `ui` Text children hold at most 10,000 chars (`TEXT_MAX`). The band shows `BAND_PREVIEW` chars. Faces in `FACES` must use single-width characters only.
- `README.md` (English) and `prompt-pal/README.md` (Chinese) both document commands and pane keys. Update both when you change user-facing behavior.
