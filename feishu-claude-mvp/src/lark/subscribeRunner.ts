import { spawn } from 'node:child_process';
import readline from 'node:readline';
import type { BridgeConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { nextBackoff, sleep } from '../utils/backoff.js';

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

export class SubscribeRunner {
  public constructor(private readonly config: BridgeConfig) {}

  public async run(onLine: (line: string) => Promise<void>): Promise<never> {
    let attempt = 0;

    while (true) {
      try {
        await this.runOnce(onLine);
        attempt = 0;
      } catch (error) {
        attempt += 1;
        const delay = nextBackoff(attempt);
        logger.error('Subscriber crashed; restarting', {
          delay,
          error: error instanceof Error ? error.message : String(error),
        });
        await sleep(delay);
      }
    }
  }

  private runOnce(onLine: (line: string) => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        'event',
        '+subscribe',
        '--as',
        'bot',
        '--event-types',
        'im.message.receive_v1',
        '--compact',
        '--quiet',
        '--force',
      ];

      const child = spawn(this.config.larkCliPath, args, {
        cwd: this.config.projectRoot,
        env: safeEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      logger.info('lark-cli subscriber spawned', { pid: child.pid, args });

      const lineReader = readline.createInterface({ input: child.stdout });
      let closing = false;
      let stderr = '';
      let chain = Promise.resolve();

      lineReader.on('line', (line) => {
        chain = chain
          .then(() => onLine(line))
          .catch((error) => {
            logger.error('Failed to handle incoming event line', {
              error: error instanceof Error ? error.message : String(error),
            });
          });
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        if (closing) {
          return;
        }
        closing = true;
        lineReader.close();
        reject(error);
      });

      child.on('close', (code) => {
        if (closing) {
          return;
        }
        closing = true;
        lineReader.close();
        void chain.finally(() => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(`lark-cli subscribe exited with code ${code}: ${stderr.trim()}`));
        });
      });
    });
  }
}
