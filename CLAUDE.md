# lark-bots

Feishu/Lark bot projects using lark-cli and Claude Code.

## Projects

### feishu-claude-mvp

A Node.js bridge that connects Feishu IM to a local Claude CLI session, with streaming support, rich card rendering, and LaTeX formula images.

## Tech Stack

- **Runtime**: Node.js (ESM), TypeScript, tsx
- **IM transport**: lark-cli (Feishu CLI)
- **AI backend**: Claude CLI (supports GLM/Anthropic-compatible backends)
- **Testing**: Vitest
- **Formula rendering**: texsvg (LaTeX -> SVG), sharp (SVG -> PNG)

## Key Commands (feishu-claude-mvp)

```bash
npm start        # start the bridge
npm run stop     # gracefully stop the bridge (reads PID from lock file)
npm run dev      # start with file-watching auto-restart
npm test         # run tests
npm run typecheck # TypeScript type checking
```

## Architecture (feishu-claude-mvp)

```
Feishu IM
  -> lark-cli event +subscribe (WebSocket)
  -> eventParser (NDJSON lines)
  -> bridgeService.handleEvent()
    -> commandRouter (/help, /status, /reset, /markdown, /card, /cd, or prompt)
    -> claudeProcess.runPromptStream() (claude CLI subprocess)
    -> streamingBuffer (flush on newline / min chars / timer)
    -> replyClient (ack card -> streaming PATCH updates -> final PATCH with formulas)
    -> Feishu IM
```

Key files:
- `src/index.ts` — bootstrap, signal handlers, startup notification
- `src/bridgeService.ts` — orchestration, rate limiting, lock mechanism
- `src/config.ts` — environment loading and validation
- `src/claude/claudeProcess.ts` — Claude CLI subprocess wrapper (supports custom backend env vars)
- `src/claude/formulaRenderer.ts` — LaTeX -> SVG -> PNG -> Feishu image upload
- `src/claude/responseFormatter.ts` — chunk splitting, streaming buffer
- `src/lark/cardBuilder.ts` — JSON 2.0 / 1.0 card content builders
- `src/lark/replyClient.ts` — message reply, card reply, PATCH updates
- `src/lark/subscribeRunner.ts` — lark-cli event subscription
- `src/session/sessionStore.ts` — session CRUD, event dedup

## GLM Backend

The bridge supports routing Claude CLI requests through GLM or other Anthropic-compatible backends by setting environment variables in `.env`:

- `ANTHROPIC_BASE_URL` — API endpoint URL
- `ANTHROPIC_AUTH_TOKEN` — auth token
- `ANTHROPIC_DEFAULT_OPUS_MODEL` / `SONNET_MODEL` / `HAIKU_MODEL` — model names

These are injected into the Claude CLI subprocess environment via `buildChildEnv()` in `claudeProcess.ts`.

## Development Conventions

- **ESM only** — `"type": "module"` in package.json, use `.js` extensions in imports
- **Immutable data** — prefer creating new objects over mutation
- **Error handling** — always handle errors explicitly, log context on server side, safe messages to users
- **Lock file** — `data/bridge.lock` with PID for single-instance enforcement and graceful `npm run stop`
- **No secrets in code** — all credentials via `.env` (gitignored)

## Project-Specific Configuration

Each sub-project has its own `.claude/` directory with project-specific rules and skills:

- `feishu-claude-mvp/CLAUDE.md` — detailed architecture, message flow, and gotchas
- `feishu-claude-mvp/.claude/rules/feishu-cards.md` — Feishu card API constraints (JSON 2.0 vs 1.0, img limitations)
- `feishu-claude-mvp/.claude/rules/bridge-conventions.md` — code style, subprocess patterns, state management, testing
- `feishu-claude-mvp/.claude/rules/formula-rendering.md` — formula pipeline, canvas constants, tuning guide
- `feishu-claude-mvp/.claude/skills/feishu-bridge-dev/` — development skill for common tasks and debugging
