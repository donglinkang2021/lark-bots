# Feishu Card API Constraints

These are hard-learned constraints from testing against the Feishu Bot API. Violating any of these will cause API errors or broken rendering.

## JSON 2.0 vs JSON 1.0

- JSON 2.0 schema: `{ schema: '2.0', config: { wide_screen_mode: true }, body: { elements: [...] } }`
- JSON 1.0 schema: `{ config: { wide_screen_mode: true }, elements: [...] }`
- DO NOT mix schema versions in a single card

## Image Constraints

- JSON 2.0 `img` element does NOT support: `compact_width`, `size`, `scale_type`, `mode`
  - These cause API errors: "img size is not allowed" / "img mode is not supported"
- JSON 1.0 `img` supports: `compact_width` (caps at 278px), `custom_width`
- JSON 2.0 markdown `![](img_key)` images always stretch to full card width — no workaround
- To control display size: control the PNG pixel dimensions directly (formula canvas approach)

## lark-cli Image Upload

- Use `--data` for JSON body params (NOT `--params` which are query params)
- `--file` requires RELATIVE paths from project root (absolute paths fail)
- Image type must be: `--data '{"image_type": "message"}'`
- Response format: `{ data: { image_key: "img_v3_..." } }`

## Message Updates (PATCH)

- PATCH only works on interactive (card) messages — plain text messages return "This message is NOT a card"
- Always send ack as interactive card via `replyCardToMessage()` to enable subsequent PATCH updates
- PATCH endpoint: `PATCH /open-apis/im/v1/messages/{message_id}`

## Card Element Rules

- `alt` in `img` must be: `{ tag: 'plain_text', content: 'text' }` — NOT a plain string
  - Plain string `alt: "formula"` causes "parse card json err... failed to unmarshal for PlainText"
- Empty `elements: []` in columns may cause API errors — always include at least one element
- JSON 2.0 `markdown` element supports: headings, bold/italic, code blocks, tables, blockquotes, lists
- JSON 1.0 `lark_md` only supports: bold, italic, links — no code blocks, tables, or headings
