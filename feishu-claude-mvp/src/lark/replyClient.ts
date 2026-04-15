import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { BridgeConfig } from '../config.js';
import { buildStreamingCardContent, buildFinalCardContent } from './cardBuilder.js';
import type { RenderMode } from '../session/sessionTypes.js';

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
   * Uses streaming card content (no formula image rendering — fast).
   */
  public async replyCardToMessage(messageId: string, text: string, mode: RenderMode = 'card'): Promise<string | null> {
    const cardContent = buildStreamingCardContent(text, mode);
    const { stdout } = await runLarkCli(this.config, [
      'im',
      '+messages-reply',
      '--as', 'bot',
      '--message-id', messageId,
      '--msg-type', 'interactive',
      '--content', cardContent,
      '--idempotency-key', randomUUID(),
    ]);

    return extractMessageId(stdout);
  }

  /**
   * Update an existing card message during streaming (fast, no formula rendering).
   */
  public async updateMessage(messageId: string, text: string, mode: RenderMode = 'card'): Promise<void> {
    const cardContent = buildStreamingCardContent(text, mode);
    const body = JSON.stringify({ content: cardContent });

    await runLarkCli(this.config, [
      'api', 'PATCH', `/open-apis/im/v1/messages/${messageId}`,
      '--as', 'bot',
      '--data', body,
    ]);
  }

  /**
   * Final update after Claude completes — renders LaTeX formulas to images.
   */
  public async updateFinalMessage(messageId: string, text: string, mode: RenderMode = 'card'): Promise<void> {
    const cardContent = await buildFinalCardContent(text, mode, this.config);
    const body = JSON.stringify({ content: cardContent });

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
