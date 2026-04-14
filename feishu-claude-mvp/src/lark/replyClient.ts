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

export class ReplyClient {
  public constructor(private readonly config: BridgeConfig) {}

  public async replyToMessage(messageId: string, text: string): Promise<void> {
    await this.run([
      'im',
      '+messages-reply',
      '--as',
      'bot',
      '--message-id',
      messageId,
      '--content',
      textToJsonContent(text),
      '--idempotency-key',
      randomUUID(),
    ]);
  }

  public async sendToUser(userId: string, text: string): Promise<void> {
    await this.run([
      'im',
      '+messages-send',
      '--as',
      'bot',
      '--user-id',
      userId,
      '--content',
      textToJsonContent(text),
      '--idempotency-key',
      randomUUID(),
    ]);
  }

  private async run(args: readonly string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.config.larkCliPath, [...args], {
        cwd: this.config.projectRoot,
        env: safeEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`lark-cli reply failed with code ${code}: ${stderr.trim()}`));
          return;
        }

        resolve();
      });
    });
  }
}
