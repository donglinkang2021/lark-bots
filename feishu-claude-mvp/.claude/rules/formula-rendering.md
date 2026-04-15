# Formula Rendering Rules

Guidelines for modifying the LaTeX formula rendering pipeline in `src/claude/formulaRenderer.ts`.

## Rendering Pipeline

1. `extractFormulas()` — regex-based, two-pass (display first, then inline)
2. `renderFormulaToPng()` — texsvg -> scaled SVG -> sharp PNG -> fixed-width canvas composite
3. `uploadImage()` — write temp PNG -> lark-cli upload -> parse image_key -> delete temp
4. `renderFormulasToElements()` — orchestrates the above, builds `CardElement[]`

## Canvas Constants (tune these for display size)

- `CANVAS_WIDTH = 1200` — fixed width for all images; wider = smaller formula when Feishu stretches
- `LINE_HEIGHT = 80` — per-row height in pixels
- `RENDER_SCALE = 8` — SVG scale multiplier; higher = crisper but larger files

To make formulas appear smaller in the card: increase `CANVAS_WIDTH`.
To make formulas appear larger: decrease `CANVAS_WIDTH`.

## Design Decisions

- **Inline formulas ($...$) use backtick code**, NOT images — Feishu stretches images to full card width, making inline formulas huge
- **Display formulas ($$...$$) use fixed-width canvas** — same width for all images means consistent symbol size when Feishu stretches them
- **Height is adaptive** — multi-line formulas expand naturally (80px per line), never squeezed
- **Fallback** — if rendering or upload fails, display math becomes ` ```math ` code block, inline becomes backtick

## When Modifying

- Test with both single-line (`$$E=mc^2$$`) and multi-line formulas (aligned environments)
- Verify that the uploaded PNG dimensions match expectations by checking `sharp` metadata
- The `uploadImage` function requires `data/` directory to exist under `config.projectRoot`
- Always clean up temp PNG files in the `close` handler (best-effort `fs.unlinkSync`)
