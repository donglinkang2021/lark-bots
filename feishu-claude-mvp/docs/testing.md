# Testing

## Automated checks

Run all tests:

```bash
npm test
```

Run typecheck:

```bash
npm run typecheck
```

## Streaming-focused coverage

Current streaming-related checks include:
- `test/unit/claudeProcess.test.ts`
  - parses `stream-json` text deltas
  - parses final `result` payloads
  - handles structured error lines
- `test/unit/routerFormatter.test.ts`
  - verifies streaming buffer flush rules
  - verifies timer-based flushes and ordering
- `test/integration/bridgeService.test.ts`
  - verifies partial replies are emitted before completion
  - verifies final `claudeSessionId` persistence
  - verifies short terminal failure note after partial output

## Manual verification checklist

1. Start the bridge:

```bash
npm start
```

2. Send a Feishu message that should produce a longer reply.
3. Confirm the first partial reply arrives before the full Claude run finishes.
4. Confirm later partial replies arrive in order.
5. Confirm the next user turn resumes the same Claude session.
6. Confirm `/status` still reports the current conversation and session id.
7. Confirm `/reset` clears the session and starts fresh on the next prompt.
8. Confirm failure cases still produce safe user-facing messages.

## Known validation gaps

- No end-to-end test currently verifies real Feishu API timing.
- No restart-recovery test exists for in-progress streamed replies.
- Multi-conversation concurrency is still intentionally unoptimized.
