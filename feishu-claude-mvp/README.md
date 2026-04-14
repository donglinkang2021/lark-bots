# Feishu Claude MVP

A minimal Node.js bridge that listens to Feishu IM events through `lark-cli`, forwards approved text messages into a local `claude` CLI session, and replies back into Feishu.

## What this MVP does

- Subscribes to `im.message.receive_v1` via `lark-cli event +subscribe --compact --quiet`
- Restricts access with sender/chat allowlists
- Maintains one Claude session per Feishu conversation
- Continues multi-turn Claude sessions with `--resume <session_id>`
- Replies to the originating Feishu message using `lark-cli im +messages-reply`
- Persists only lightweight session/event metadata in `data/state.json`
- Applies basic hardening:
  - serialized event handling
  - atomic lock file creation with stale-lock recovery
  - sanitized subprocess environments
  - safe user-facing error replies
  - message type and prompt-length checks
  - per-conversation rate limiting

## Project layout

- `src/index.ts` — app bootstrap
- `src/bridgeService.ts` — main orchestration and guardrails
- `src/config.ts` — env loading and validation
- `src/lark/` — event parsing, reply client, subscription runner
- `src/claude/` — Claude CLI wrapper and response chunking
- `src/session/` — session/state types and store
- `src/persistence/stateFile.ts` — atomic JSON persistence
- `docs/` — architecture, streaming design, and testing notes
- `test/` — unit and integration tests

## Requirements

- Node.js + npm
- `lark-cli` installed and configured
- `claude` CLI installed and authenticated
- Feishu app long connection configured with `im.message.receive_v1`

## Setup

1. Copy env file:
   - `cp .env.example .env`
2. Fill in at least:
   - `PROJECT_ROOT`
   - `ALLOWED_SENDER_IDS`
3. Optional controls:
   - `ALLOWED_CHAT_IDS` if you want to restrict to a specific chat as well
4. Optional hardening/runtime knobs:
   - `CLAUDE_PERMISSION_MODE` defaults to `default`
   - `CLAUDE_ALLOWED_TOOLS`
   - `MIN_EVENT_INTERVAL_MS`
   - `MAX_PROMPT_CHARS`
   - `STREAMING_FLUSH_INTERVAL_MS`
   - `STREAMING_MIN_FLUSH_CHARS`

## Run

```bash
npm install
npm run dev
```

Or once:

```bash
npm start
```

## Commands in Feishu

- plain text — continue the Claude conversation
- `/status` — show current session status
- `/reset` — clear the conversation session
- `/help` — show help text

## Test

```bash
npm test
npm run typecheck
```

See also:
- `docs/architecture.md`
- `docs/streaming-design.md`
- `docs/testing.md`

## Current limitations

- Text messages only
- Single configured project root
- Private assistant use only; not designed for group chat workflows yet
- Streaming replies now use appended reply chunks, not message edits
- Global event handling is still serialized, so one long run can delay other conversations
- The Claude subprocess currently inherits the local bridge environment for auth compatibility; run this only in a trusted local setup
- Rate-limit responses may be chunked when reply size is small

## Suggested next steps

1. Add a proper queue keyed by conversation so long runs do not block unrelated chats
2. Improve streaming delivery with richer reply UX or message editing if transport supports it well
3. Add explicit approval flow for dangerous local actions
4. Add multiple workspace routing (`/project ...`)
5. Add operational logging/metrics
