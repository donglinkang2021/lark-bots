import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import texsvg from 'texsvg';
import sharp from 'sharp';

import type { BridgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';

type FormulaMatch = {
  readonly latex: string;
  readonly displayMode: boolean;
  readonly placeholder: string;
};

/**
 * Card element types for building JSON 2.0 card body.
 * - markdown: text content with markdown rendering
 * - img: formula image element
 */
export type CardElement =
  | { readonly tag: 'markdown'; readonly content: string }
  | { readonly tag: 'img'; readonly img_key: string; readonly alt: { readonly tag: 'plain_text'; readonly content: string } };

const FORMULA_DISPLAY_RE = /\$\$([\s\S]*?)\$\$/g;
const FORMULA_INLINE_RE = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g;

/**
 * Extract all LaTeX formulas from markdown text and replace with placeholders.
 */
const extractFormulas = (text: string): { readonly text: string; readonly formulas: readonly FormulaMatch[] } => {
  const formulas: FormulaMatch[] = [];
  let counter = 0;

  const makePlaceholder = (): string => {
    counter += 1;
    return `%%FORMULA_${counter}%%`;
  };

  // First pass: display math $$...$$
  let result = text.replace(FORMULA_DISPLAY_RE, (match, _inner: string) => {
    const placeholder = makePlaceholder();
    const latex = match.slice(2, -2).trim();
    formulas.push({ latex, displayMode: true, placeholder });
    return placeholder;
  });

  // Second pass: inline math $...$ (skip already-replaced placeholders)
  result = result.replace(FORMULA_INLINE_RE, (_match, latex: string) => {
    const placeholder = makePlaceholder();
    formulas.push({ latex: latex.trim(), displayMode: false, placeholder });
    return placeholder;
  });

  return { text: result, formulas };
};

// Fixed WIDTH for all formula images — ensures consistent symbol size when Feishu stretches.
// Height is adaptive: single-line formulas get a compact height, multi-line formulas expand naturally.
const CANVAS_WIDTH = 1200;
const LINE_HEIGHT = 80; // per-row height in pixels
const RENDER_SCALE = 8; // high resolution for crisp display

/**
 * Render a LaTeX string to a fixed-WIDTH, adaptive-height PNG buffer.
 * Width is always CANVAS_WIDTH so all formulas share the same horizontal scale.
 * Height scales with content: 1 line → 80px, 2 lines → 160px, etc.
 * This keeps single-line formulas compact while multi-line formulas stay readable.
 */
const renderFormulaToPng = async (latex: string): Promise<Buffer> => {
  const svg = await texsvg(latex);

  const scaledSvg = svg
    .replace(/width="([^"]+)"/, (_m, w) => `width="${parseFloat(w) * RENDER_SCALE}ex"`)
    .replace(/height="([^"]+)"/, (_m, h) => `height="${parseFloat(h) * RENDER_SCALE}ex"`);

  // Render formula at its natural high-res size
  const formulaPng = await sharp(Buffer.from(scaledSvg))
    .png()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toBuffer();

  const formulaMeta = await sharp(formulaPng).metadata();
  const fw = formulaMeta.width ?? 100;
  const fh = formulaMeta.height ?? 40;

  // Calculate canvas height: round up to nearest LINE_HEIGHT, minimum 1 line
  const canvasHeight = Math.max(LINE_HEIGHT, Math.ceil(fh / LINE_HEIGHT) * LINE_HEIGHT);

  // Scale formula to fit within CANVAS_WIDTH (never enlarge)
  const targetW = Math.min(fw, CANVAS_WIDTH);
  const scaleRatio = targetW / fw;
  const targetH = Math.round(fh * scaleRatio);

  const resizedPng = fw > CANVAS_WIDTH
    ? await sharp(formulaPng).resize(targetW, targetH).toBuffer()
    : formulaPng;

  const actualW = fw > CANVAS_WIDTH ? targetW : fw;
  const actualH = fw > CANVAS_WIDTH ? targetH : fh;

  // Center formula on the fixed-width, adaptive-height canvas
  const offsetX = Math.floor((CANVAS_WIDTH - actualW) / 2);
  const offsetY = Math.floor((canvasHeight - actualH) / 2);

  return sharp({
    create: {
      width: CANVAS_WIDTH,
      height: canvasHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: resizedPng, left: offsetX, top: offsetY }])
    .png()
    .toBuffer();
};

/**
 * Upload a PNG buffer to Feishu and return the img_key.
 */
const uploadImage = (config: BridgeConfig, pngBuffer: Buffer): Promise<string> =>
  new Promise((resolve, reject) => {
    const dataDir = path.join(config.projectRoot, 'data');
    const tmpFile = path.join(dataDir, `_formula_${Date.now()}.png`);
    fs.writeFileSync(tmpFile, pngBuffer);

    const relativePath = path.relative(config.projectRoot, tmpFile);
    const child = spawn(config.larkCliPath, [
      'im', 'images', 'create',
      '--as', 'bot',
      '--data', JSON.stringify({ image_type: 'message' }),
      '--file', relativePath,
    ], {
      cwd: config.projectRoot,
      env: {
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        USER: process.env.USER,
        LOGNAME: process.env.LOGNAME,
        SHELL: process.env.SHELL,
        TERM: process.env.TERM,
        LANG: process.env.LANG,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer | string) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer | string) => { stderr += chunk.toString(); });

    child.on('error', (error) => { reject(error); });

    child.on('close', (code) => {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore cleanup errors
      }

      if (code !== 0) {
        reject(new Error(`Image upload failed: ${stderr.trim()}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim()) as { data?: { image_key?: string } };
        const imageKey = parsed.data?.image_key;
        if (!imageKey) {
          reject(new Error(`No image_key in response: ${stdout.trim()}`));
          return;
        }
        resolve(imageKey);
      } catch {
        reject(new Error(`Failed to parse upload response: ${stdout.trim()}`));
      }
    });
  });

/**
 * Process markdown text: render LaTeX formulas and return structured CardElement[].
 * Display formulas ($$...$$) become column_set elements with constrained-width images.
 * Inline formulas ($...$) become code backticks (no image — avoids full-width stretch).
 * Falls back to code blocks if rendering or upload fails.
 */
export const renderFormulasToElements = async (text: string, config: BridgeConfig): Promise<readonly CardElement[]> => {
  const { text: textWithPlaceholders, formulas } = extractFormulas(text);

  if (formulas.length === 0) {
    return [{ tag: 'markdown', content: text }];
  }

  // Render all formulas — collect image keys or fallbacks
  const formulaResults = new Map<string, { readonly type: 'image'; readonly imageKey: string } | { readonly type: 'fallback'; readonly content: string }>();

  for (const formula of formulas) {
    try {
      if (formula.displayMode) {
        const pngBuffer = await renderFormulaToPng(formula.latex);
        const imageKey = await uploadImage(config, pngBuffer);
        formulaResults.set(formula.placeholder, { type: 'image', imageKey });
      } else {
        // Inline formulas: use code backtick instead of image to avoid full-width stretch
        formulaResults.set(formula.placeholder, { type: 'fallback', content: `\`${formula.latex}\`` });
      }
    } catch (error) {
      logger.warn('Failed to render formula, falling back to code block', {
        latex: formula.latex.slice(0, 80),
        error: error instanceof Error ? error.message : String(error),
      });

      if (formula.displayMode) {
        formulaResults.set(formula.placeholder, { type: 'fallback', content: `\`\`\`math\n${formula.latex}\n\`\`\`` });
      } else {
        formulaResults.set(formula.placeholder, { type: 'fallback', content: `\`${formula.latex}\`` });
      }
    }
  }

  // Split text around display-formula image placeholders into CardElement segments
  const elements: CardElement[] = [];
  let remaining = textWithPlaceholders;
  let currentMarkdown = '';

  while (remaining.length > 0) {
    // Find the next display-formula image placeholder
    let nextImageIdx = -1;
    let nextImagePlaceholder = '';

    for (const formula of formulas) {
      if (!formula.displayMode) continue;
      const result = formulaResults.get(formula.placeholder);
      if (!result || result.type !== 'image') continue;

      const idx = remaining.indexOf(formula.placeholder);
      if (idx !== -1 && (nextImageIdx === -1 || idx < nextImageIdx)) {
        nextImageIdx = idx;
        nextImagePlaceholder = formula.placeholder;
      }
    }

    if (nextImageIdx === -1) {
      // No more image placeholders — rest is markdown text
      // Replace any remaining inline fallback placeholders
      for (const [placeholder, result] of formulaResults) {
        if (result.type === 'fallback') {
          remaining = remaining.replace(placeholder, result.content);
        }
      }
      currentMarkdown += remaining;
      remaining = '';
    } else {
      // Text before the image placeholder
      let before = remaining.slice(0, nextImageIdx);
      const after = remaining.slice(nextImageIdx + nextImagePlaceholder.length);

      // Replace any inline fallback placeholders in the text before
      for (const [placeholder, result] of formulaResults) {
        if (result.type === 'fallback') {
          before = before.replace(placeholder, result.content);
        }
      }

      currentMarkdown += before;

      // Flush accumulated markdown
      if (currentMarkdown.trim()) {
        elements.push({ tag: 'markdown', content: currentMarkdown.trim() });
      }
      currentMarkdown = '';

      // Add the display formula as a standalone img element
      const imageResult = formulaResults.get(nextImagePlaceholder)!;
      if (imageResult.type === 'image') {
        elements.push({
          tag: 'img',
          img_key: imageResult.imageKey,
          alt: { tag: 'plain_text', content: 'formula' },
        });
      }

      remaining = after;
    }
  }

  // Flush any remaining markdown
  if (currentMarkdown.trim()) {
    elements.push({ tag: 'markdown', content: currentMarkdown.trim() });
  }

  return elements.length > 0 ? elements : [{ tag: 'markdown', content: text }];
};
