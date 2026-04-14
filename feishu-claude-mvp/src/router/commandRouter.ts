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
    '- /help to show this message',
  ].join('\n');
