import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { BridgeConfig } from '../config.js';

const safeEnv = (): NodeJS.ProcessEnv => {
  const allowedKeys = ['HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TERM', 'LANG', 'LC_ALL', 'TMPDIR', 'TMP', 'TEMP'];

  return allowedKeys.reduce<NodeJS.ProcessEnv>((accumulator, key) => {
    const value = process.env[key];
    if (value) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});
};

const textToJsonContent = (text: string): string =>
  JSON.stringify({ text });

/**
 * Build an interactive card JSON content string from plain text.
 * Cards are required for PATCH updates — plain text messages cannot be updated.
 */
const textToCardContent = (text: string): string =>
  JSON.stringify({
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: 'div',
        text: { tag: 'plain_text', content: text },
      },
    ],
  });

type RunResult = {
  readonly stdout: string;
};

const runLarkCli = (config: BridgeConfig, args: readonly string[]): Promise<RunResult> =>
  new Promise<RunResult>((resolve, reject) => {
    const child = spawn(config.larkCliPath, [...args], {
      cwd: config.projectRoot,
      env: safeEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`lark-cli failed with code ${code}: ${stderr.trim()}`));
        return;
      }

      resolve({ stdout });
    });
  });

const extractMessageId = (stdout: string): string | null => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as { data?: { message_id?: string } };
    return parsed.data?.message_id ?? null;
  } catch {
    return null;
  }
};

export class ReplyClient {
  public constructor(private readonly config: BridgeConfig) {}

  /**
   * Reply to a message with plain text (non-updatable).
   * Used for simple one-shot replies like error messages, status, etc.
   */
  public async replyToMessage(messageId: string, text: string): Promise<string | null> {
    const { stdout } = await runLarkCli(this.config, [
      'im',
      '+messages-reply',
      '--as', 'bot',
      '--message-id', messageId,
      '--content', textToJsonContent(text),
      '--idempotency-key', randomUUID(),
    ]);

    return extractMessageId(stdout);
  }

  /**
   * Reply to a message with an interactive card (updatable via updateMessage).
   * Returns the created message ID for subsequent updates.
   */
  public async replyCardToMessage(messageId: string, text: string): Promise<string | null> {
    const { stdout } = await runLarkCli(this.config, [
      'im',
      '+messages-reply',
      '--as', 'bot',
      '--message-id', messageId,
      '--msg-type', 'interactive',
      '--content', textToCardContent(text),
      '--idempotency-key', randomUUID(),
    ]);

    return extractMessageId(stdout);
  }

  /**
   * Update an existing card message with new text content.
   * Only works on interactive (card) messages — plain text messages cannot be updated.
   */
  public async updateMessage(messageId: string, text: string): Promise<void> {
    const body = JSON.stringify({ content: textToCardContent(text) });

    await runLarkCli(this.config, [
      'api', 'PATCH', `/open-apis/im/v1/messages/${messageId}`,
      '--as', 'bot',
      '--data', body,
    ]);
  }

  public async sendToUser(userId: string, text: string): Promise<void> {
    await runLarkCli(this.config, [
      'im',
      '+messages-send',
      '--as', 'bot',
      '--user-id', userId,
      '--content', textToJsonContent(text),
      '--idempotency-key', randomUUID(),
    ]);
  }
}
