# buddy · prompt-pal

A companion for [Claude Code](https://code.claude.com), built as a Claude Code **mod**. Bit lives in the band above your prompt, watches what Claude is doing, and acts as your advocate in the session.

- **Live status**: reacts to every tool call and turn: reading, editing, running, errors, done.
- **Understands your intent**: tracks everything you ask Claude during the session and keeps a running read on what you actually want.
- **Reviews Claude's answers**: after each turn Bit checks the result against your intent, verifies claims with read-only tools, and decides: done, follow up with Claude, or ask you. Claude does the real work; Bit directs and verifies.
- **Talks to Claude and subagents**: `/buddy @claude …`, `/buddy @agents …`, and Claude/agents can reply through the `mcp__prompt-pal__bit` tool.
- **Read-only tools**: list/read/grep/find files, read-only git, session transcript, shared memory search, web fetch/search. Paths that may hold secrets are refused.
- **Personality and memory**: six presets or your own description; reads Claude Flow shared memory, `~/.claude/CLAUDE.md` and project auto memory. Settings and pet stats carry over between sessions. The conversation with Bit lasts only for the session, though it survives a plugin reload.

## Install

Requires Claude Code v2.1.287 or later.

```bash
claude plugin marketplace add nittygritty-zzy/buddy
claude plugin install prompt-pal@local-mods
```

Then run `/reload-plugins` (or start a new session) and type `/buddy`.

To review what the mod does before installing:

```bash
git clone https://github.com/nittygritty-zzy/buddy.git
claude plugin validate ./buddy/prompt-pal
```

## Use

| Command | What it does |
|---|---|
| `/buddy` | Open the pane: intent, activity, conversation, settings |
| `/buddy <message>` | Talk to Bit |
| `/buddy @claude <message>` | Bit writes and sends a message to Claude |
| `/buddy @agents <message>` | Bit messages the running subagents |
| `/buddy stop` | Stop Bit's current lookup |

Pane keys: `v` review answers · `a` auto-relay · `w` whisper to Claude · `m` memory · `c` chattiness · `1-6` personality · `p` pet · `f` feed · `h` hide · `k` stop.

## Safety notes

Mods run in-process with your user permissions and are not sandboxed. Bit's tools are read-only, but with **auto-relay** on, Bit can start Claude turns on its own. Claude then works under your normal permission mode. Bit runs on autopilot: it keeps following up until the work is done. It pauses and hands back to you when nothing in the repo changes for 2 rounds, when Claude errors 2 rounds in a row, when it would repeat the same request, or after 15 follow-ups. Even with auto-relay on, relays that ask for something irreversible (push, force-push, merge to main, deleting branches or files, `rm -rf`, `curl | sh`, sudo, credentials) wait for you to press 1. So do risky relays written after Bit read the web. Turn auto-relay off (`a`) if you want to confirm every message.

Talking, reviewing and tool use call `haiku` through your Claude Code plan or API key.

See [`prompt-pal/README.md`](prompt-pal/README.md) for details (中文).
