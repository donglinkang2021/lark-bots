# Bridge Development Conventions

Rules specific to the feishu-claude-mvp bridge codebase.

## Code Style

- **ESM only** — all imports use `.js` extensions: `import { X } from './module.js'`
- **Immutability** — types use `readonly`, state updates use spread: `{ ...existing, ...patch }`
- **No console.log** — use `logger.info/warn/error` from `src/utils/logger.ts`
- **Error handling** — always catch, always log context, never expose internals to users
- **TypeScript strict** — `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`

## Subprocess Patterns

- **lark-cli** calls use `safeEnv()` — only whitelisted env vars (HOME, PATH, USER, etc.)
- **claude CLI** calls use `buildChildEnv()` — starts from `process.env` and overrides Anthropic vars
- Both use `cwd: config.projectRoot` and `stdio: ['ignore', 'pipe', 'pipe']`
- Never pass absolute file paths to lark-cli `--file` — use `path.relative(config.projectRoot, filePath)`

## State & Persistence

- State writes are atomic: write to `.tmp` then `fs.renameSync`
- Lock file uses `flag: 'wx'` (exclusive create) with PID for stale recovery
- Event dedup keeps max 200 processed event IDs (pruned in SessionStore)
- Session keys: `chatId:threadId` when threaded, just `chatId` otherwise

## Streaming Flow

- Streaming buffer flushes on: newline boundary, min chars threshold, or timer
- Card PATCH updates throttled by `streamingUpdateIntervalMs` (default 1500ms)
- First flush updates the ack card in-place
- Final update renders LaTeX formulas (slow — only done once after completion)

## Testing

- Framework: Vitest with `vitest/globals`
- Use `FakeClaudeProcess` and `FakeReplyClient` for integration tests
- Use `makeConfig()` and `makeEvent()` test helpers
- Use `vi.useFakeTimers()` / `vi.runAllTimersAsync()` for streaming buffer tests
- Temp dirs: `fs.mkdtempSync(path.join(process.cwd(), 'tmp-...'))` — leave cleanup to gitignore
