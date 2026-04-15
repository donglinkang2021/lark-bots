---
name: feishu-bridge-dev
description: Development guide for the feishu-claude-mvp bridge. Use this skill when working on the Feishu-Claude bridge codebase: modifying message handling, card rendering, formula pipeline, session management, lark-cli integration, or any code in the feishu-claude-mvp directory. Also use when debugging issues with Feishu bot message display, card formatting, or Claude subprocess interaction.
---

# Feishu-Claude Bridge Development

## Quick Context

This is a Node.js ESM bridge that forwards Feishu IM messages to a local Claude CLI subprocess and streams replies back as interactive Feishu cards.

## Key Architectural Points

### Message Flow
Event -> dedup -> security check -> rate limit -> command route -> ack card -> Claude stream -> streaming PATCH -> final PATCH (with formula rendering)

### Two Render Modes
- **Card mode** (default): JSON 2.0 interactive card with markdown element + formula images
- **Text mode** (`/markdown`): JSON 1.0 plain_text div, no formatting

### Formula Rendering (only on final update, NOT during streaming)
- Display `$$...$$` -> fixed-width canvas PNG (texsvg+sharp) -> Feishu image upload -> `img` card element
- Inline `$...$` -> backtick code (avoids full-width image stretch)
- Fallback: code blocks if rendering/upload fails

## Common Tasks

### Adding a New Bot Command
1. Add command type to `src/lark/types.ts` (`SupportedCommand` + `Command` discriminated union)
2. Add parsing logic to `src/router/commandRouter.ts`
3. Handle in `src/bridgeService.ts` `handleEvent()` switch
4. Update help text in `commandRouter.ts`

### Modifying Card Rendering
- Streaming cards: `src/lark/cardBuilder.ts` `buildStreamingCardContent()` — must be fast, no image rendering
- Final cards: `buildFinalCardContent()` — async, renders formulas
- Card elements: `src/claude/formulaRenderer.ts` `CardElement` type

### Debugging Feishu Card Issues
- Check `.claude/rules/feishu-cards.md` for API constraints
- JSON 2.0 `img` does NOT support `compact_width`/`size`/`scale_type`
- PATCH only works on interactive card messages
- `alt` in `img` must be `{ tag: 'plain_text', content: '...' }`, not a plain string

### Tuning Formula Image Size
- Edit constants in `src/claude/formulaRenderer.ts`:
  - `CANVAS_WIDTH` — wider = smaller formula (Feishu stretches to card width)
  - `LINE_HEIGHT` — height per formula row
  - `RENDER_SCALE` — SVG scale multiplier for resolution

## Testing

```bash
npm test          # vitest run
npm run typecheck # tsc --noEmit
```

- Integration tests use `FakeClaudeProcess` and `FakeReplyClient`
- Test helpers: `makeConfig()`, `makeEvent()` in `test/integration/bridgeService.test.ts`
- Streaming tests require `vi.useFakeTimers()` / `vi.runAllTimersAsync()`
