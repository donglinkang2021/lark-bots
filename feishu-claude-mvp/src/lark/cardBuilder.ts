import type { BridgeConfig } from '../config.js';
import { renderFormulasToElements, type CardElement } from '../claude/formulaRenderer.js';

export type { CardElement } from '../claude/formulaRenderer.js';
export type RenderMode = 'card' | 'text';

/**
 * Build JSON 2.0 card body elements from a flat element list.
 */
const buildCardElements = (elements: readonly CardElement[]): string =>
  JSON.stringify({
    schema: '2.0',
    config: { wide_screen_mode: true },
    body: {
      elements,
    },
  });

/**
 * Build JSON 2.0 card content with a single markdown element.
 * Feishu renders headings, code blocks, tables, blockquotes, lists, etc.
 */
const buildMarkdownCard = (text: string): string =>
  buildCardElements([{ tag: 'markdown', content: text }]);

/**
 * Build JSON 1.0 card content with plain_text div.
 * Displays text literally — no markdown rendering.
 */
const buildTextModeContent = (text: string): string =>
  JSON.stringify({
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: 'div',
        text: { tag: 'plain_text', content: text },
      },
    ],
  });

/**
 * Quick fallback for display math during streaming:
 * converts $$...$$ to code blocks without image rendering.
 */
const fallbackDisplayMath = (text: string): string =>
  text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, inner: string) => {
    const trimmed = inner.trim();
    return `\`\`\`math\n${trimmed}\n\`\`\``;
  });

/**
 * Build card JSON content from text for streaming updates.
 * Does NOT render LaTeX to images (too slow for streaming).
 * Uses code block fallback for display math instead.
 */
export const buildStreamingCardContent = (text: string, mode: RenderMode): string => {
  if (mode === 'text') {
    return buildTextModeContent(text);
  }

  return buildMarkdownCard(fallbackDisplayMath(text));
};

/**
 * Build final card JSON content after Claude completes.
 * Renders LaTeX formulas to compact_width img elements (not stretched to full width).
 * Falls back to code blocks if rendering fails.
 */
export const buildFinalCardContent = async (text: string, mode: RenderMode, config: BridgeConfig): Promise<string> => {
  if (mode === 'text') {
    return buildTextModeContent(text);
  }

  const elements = await renderFormulasToElements(text, config);

  return buildCardElements(elements);
};
