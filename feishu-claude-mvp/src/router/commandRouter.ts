import type { Command } from '../lark/types.js';

export const parseCommand = (content: string): Command => {
  const trimmed = content.trim();

  if (trimmed === '/help') {
    return { type: 'help' };
  }

  if (trimmed === '/status') {
    return { type: 'status' };
  }

  if (trimmed === '/reset') {
    return { type: 'reset' };
  }

  if (trimmed === '/markdown' || trimmed === '/md') {
    return { type: 'markdown' };
  }

  if (trimmed === '/card') {
    return { type: 'card' };
  }

  return {
    type: 'prompt',
    prompt: trimmed,
  };
};

export const helpMessage = (): string =>
  [
    'Feishu Claude MVP commands:',
    '- Send plain text to continue the Claude session',
    '- /status to inspect the current session',
    '- /reset to clear the current session',
    '- /markdown or /md to switch to plain text mode',
    '- /card to switch to rich card mode (default)',
    '- /help to show this message',
  ].join('\n');
