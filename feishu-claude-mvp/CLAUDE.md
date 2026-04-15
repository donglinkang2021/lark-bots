# feishu-claude-mvp

A Node.js bridge connecting Feishu IM to a local Claude CLI session, with streaming support, rich card rendering, and LaTeX formula images.

## Quick Start

```bash
cp .env.example .env   # edit with your settings
npm start               # start the bridge
npm run stop            # graceful stop via lock file PID
npm run dev             # start with file-watching auto-restart
npm test                # run tests
npm run typecheck       # TypeScript type checking
```

## Architecture

```
Feishu IM
  -> lark-cli event +subscribe
  -> eventParser (NDJSON lines)
  -> bridgeService.handleEvent()
    -> commandRouter (/help, /status, /reset, /markdown, /card, /cd, or prompt)
    -> claudeProcess.runPromptStream() (claude CLI subprocess)
    -> streamingBuffer (flush on newline / min chars / timer)
    -> replyClient (ack card -> streaming PATCH updates -> final PATCH with formulas)
    -> Feishu IM
```

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Bootstrap, signal handlers, startup notification |
| `src/bridgeService.ts` | Orchestration: dedup, rate limit, command routing, streaming lifecycle |
| `src/config.ts` | Env loading via dotenv (override: true), validation |
| `src/claude/claudeProcess.ts` | Claude CLI subprocess wrapper (runPrompt / runPromptStream) |
| `src/claude/formulaRenderer.ts` | LaTeX -> SVG -> PNG (texsvg+sharp) -> Feishu image upload |
| `src/claude/responseFormatter.ts` | Chunk splitting, streaming buffer with flush semantics |
| `src/lark/cardBuilder.ts` | JSON 2.0 / 1.0 card content builders |
| `src/lark/replyClient.ts` | lark-cli message reply, card reply, PATCH updates |
| `src/lark/subscribeRunner.ts` | lark-cli event subscription with backoff restart |
| `src/lark/eventParser.ts` | NDJSON event line parser |
| `src/session/sessionStore.ts` | Session CRUD, event dedup, state persistence |
| `src/router/commandRouter.ts` | Command parsing and help text |
| `src/security/guards.ts` | Sender/chat allowlist, message type/length checks |

## Bot Commands

| Command | Aliases | Effect |
|---------|---------|--------|
| `/help` | - | Show all commands |
| `/status` | - | Show session info (conversation, status, render_mode, working_dir, claude_session_id) |
| `/reset` | - | Delete session, start fresh next message |
| `/markdown` | `/md` | Switch to plain text mode |
| `/card` | - | Switch to rich card mode (default) |
| `/cd <path>` | - | Change working directory (loads .claude/ config, clears Claude session) |
| `/cd` | - | Show current working directory |
| `/cd -` | - | Reset to project root |

## Message Flow

1. Event arrives -> dedup + security check + rate limit
2. Command route: `/help|/status|/reset|/markdown|/card|/cd` handled directly
3. For prompts: send ack card ("正在思考...") -> start Claude stream
4. Stream deltas accumulate in buffer -> flush to card PATCH updates (throttled)
5. On completion: final PATCH with `buildFinalCardContent()` (renders LaTeX to images in card mode)
6. On error: safe user-facing message (no internal details exposed)

## Formula Rendering Pipeline

- **Display math** `$$...$$`: texsvg -> scaled SVG (8x) -> sharp PNG on fixed 1200px wide canvas with adaptive height (80px per line) -> upload to Feishu -> `img` card element
- **Inline math** `$...$`: backtick code (`` `latex` ``) — avoids full-width image stretch
- **Fallback**: code blocks on rendering/upload failure

## Configuration

All config via `.env` (gitignored). See `.env.example` for full list. Key variables:

- `PROJECT_ROOT` (required) — working directory for Claude subprocess
- `ALLOWED_SENDER_IDS` / `ALLOWED_CHAT_IDS` — access control
- `CLAUDE_PERMISSION_MODE` — `default` or `bypassPermissions` (adds `--dangerously-skip-permissions` + `IS_SANDBOX=1`)
- `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` — GLM/compatible backend support
- `STREAMING_*` — flush interval, min chars, update throttle

## Development Conventions

- **ESM only** — `"type": "module"`, use `.js` extensions in imports
- **Immutability** — `readonly` types, spread updates, never mutate
- **Error handling** — always handle explicitly, log context server-side, safe messages to users
- **Atomic writes** — StateFile writes `.tmp` then renames
- **Lock file** — `data/bridge.lock` with PID for single-instance + graceful `npm run stop`
- **No secrets in code** — all credentials via `.env`
- **Safe subprocess env** — `safeEnv()` whitelist for lark-cli, `buildChildEnv()` for claude CLI

## Gotchas

- `.env` loaded with `override: true` — overrides existing env vars
- `STREAMING_UPDATE_INTERVAL_MS` exists in code but missing from `.env.example`
- Card modes use different JSON schemas: streaming/final use JSON 2.0 (`schema: '2.0'`), text mode uses JSON 1.0
- Feishu JSON 2.0 `img` does NOT support `compact_width`/`size`/`scale_type` — those are JSON 1.0 only
- Feishu markdown `![](img_key)` images always stretch to full card width
- lark-cli `--file` requires relative paths from project root
- lark-cli image upload uses `--data` (form body), NOT `--params` (query params)
- Lock file stale recovery is recursive — could loop if another process races

## Project .claude/ Configuration

This project has its own `.claude/` directory with project-specific rules and skills loaded automatically when working in this directory:

```
.claude/
├── rules/
│   ├── feishu-cards.md        # Feishu card API constraints (JSON 2.0 vs 1.0, img limitations, PATCH rules)
│   ├── bridge-conventions.md  # Code style, subprocess patterns, state management, testing
│   └── formula-rendering.md   # Formula rendering pipeline, canvas constants, tuning guide
└── skills/
    └── feishu-bridge-dev/
        └── SKILL.md           # Development skill: common tasks, debugging, testing
```
