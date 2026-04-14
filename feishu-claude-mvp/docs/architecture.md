# Architecture

## Overview

`feishu-claude-mvp` is a local Node.js bridge that turns Feishu IM messages into local Claude CLI runs against one fixed project root.

The bridge is intentionally small:
- Feishu ingress comes from `lark-cli event +subscribe`
- Claude execution comes from the local `claude` CLI
- Session continuity is preserved with `--resume <session_id>`
- Only lightweight metadata is persisted in `data/state.json`

## Runtime flow

1. `src/index.ts`
   - loads config
   - creates `SessionStore`, `ClaudeProcess`, `ReplyClient`, and `BridgeService`
   - starts `SubscribeRunner`

2. `src/lark/subscribeRunner.ts`
   - spawns `lark-cli event +subscribe --as bot --event-types im.message.receive_v1 --compact --quiet`
   - reads compact NDJSON event lines
   - serializes event handling through a single promise chain

3. `src/lark/eventParser.ts`
   - normalizes compact IM events into `IncomingMessageEvent`

4. `src/bridgeService.ts`
   - deduplicates processed events
   - enforces sender/chat allowlists and other guards
   - routes `/help`, `/status`, `/reset`
   - runs Claude for normal prompt messages
   - sends Feishu replies

5. `src/claude/claudeProcess.ts`
   - wraps local Claude CLI invocation
   - supports final JSON mode and streaming `stream-json` mode
   - extracts final `session_id` and `result`

6. `src/lark/replyClient.ts`
   - sends reply messages through `lark-cli im +messages-reply --as bot`

7. `src/session/sessionStore.ts`
   - stores one session per conversation key
   - persists session metadata and recent processed event IDs

## Conversation model

A conversation key is:
- `chat_id:thread_id` when replying inside a thread
- otherwise just `chat_id`

Each conversation keeps:
- `claudeSessionId`
- current status (`idle`, `running`, `error`)
- latest message/event metadata

## Current execution model

### Inbound side
- all incoming events are still processed serially
- this is safe for the MVP, but one long Claude run can delay unrelated chats

### Outbound side
- replies are sent as one or more Feishu reply messages
- long outputs are chunked with `replyChunkSize`
- streaming now sends throttled partial reply chunks before the final Claude run completes

## Persistence model

Persisted state lives in `data/state.json` and currently includes:
- sessions by conversation key
- recent processed event IDs for dedupe

The bridge does **not** persist full Claude transcripts.

## Important limitations

- text messages only
- one configured project root
- global event serialization still exists
- streaming uses appended replies, not in-place message editing
- partial streaming progress is not persisted for recovery across crashes
