# Streaming Design

## Goal

Improve perceived latency in Feishu by sending partial Claude output before the local Claude subprocess fully exits.

## Scope of milestone 1

This milestone intentionally stays small:
- use Claude CLI `--output-format stream-json`
- consume `text_delta` events as they arrive
- buffer and throttle partial text before sending to Feishu
- keep existing session persistence and final `session_id` handling
- keep the current global event serialization model

## Chosen approach

### Claude side
`src/claude/claudeProcess.ts` now has two modes:
- `runPrompt(...)` for one-shot final JSON output
- `runPromptStream(...)` for streamed `stream-json` output

Streaming mode listens for:
- `stream_event` with `content_block_delta` + `text_delta`
- final `result` event carrying `session_id` and final `result`

### Buffering side
`src/claude/responseFormatter.ts` owns a small streaming buffer.

The buffer:
- accumulates incremental text deltas
- flushes immediately on newline boundaries
- flushes when accumulated text reaches `STREAMING_MIN_FLUSH_CHARS`
- otherwise flushes after `STREAMING_FLUSH_INTERVAL_MS`
- splits flushed content using the existing message chunking rules

This avoids sending one Feishu message per token.

### Bridge side
`src/bridgeService.ts` now:
- marks the session as `running`
- starts `runPromptStream(...)`
- forwards partial output through the streaming buffer
- waits for pending reply sends before finalizing the session
- stores `claudeSessionId` only after a successful final result

## Failure behavior

- If no partial output was sent and Claude fails, the user gets the normal safe failure reply.
- If partial output was already sent and Claude then fails, the user gets a short terminal note: `Claude execution ended before completion.`

This avoids replaying a large generic error after the user has already seen partial content.

## Tradeoffs

### Why appended reply messages?
Feishu reply transport already supports this cleanly through `lark-cli im +messages-reply`. Editing previously sent messages would look nicer, but would add more API and state complexity.

### Why keep global event serialization?
The immediate pain point is first-response latency, not concurrency. Per-conversation queueing is still the next performance step, but it is intentionally deferred until streaming behavior is stable.

### Why not persist partial stream progress?
The MVP only persists lightweight metadata. Persisting stream offsets/chunks would complicate restart semantics without helping the first streaming milestone enough.

## Config knobs

New environment variables:
- `STREAMING_FLUSH_INTERVAL_MS` — timer-based flush interval for partial output
- `STREAMING_MIN_FLUSH_CHARS` — minimum accumulated characters before immediate flush

## Security note

For compatibility with the existing authenticated local Claude CLI setup, `src/claude/claudeProcess.ts` still inherits the full parent environment today. That keeps auth working, but it also means this bridge should only run in a trusted local environment with minimal secrets loaded into the bridge process. Tightening the Claude subprocess environment remains an important follow-up once the exact required auth variables are pinned down.

## Follow-up

After this milestone is stable, the next recommended step is replacing the single global event chain in `src/lark/subscribeRunner.ts` with per-conversation queues so long runs do not block unrelated chats.
