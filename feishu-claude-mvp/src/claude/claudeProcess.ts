import { spawn } from 'node:child_process';
import type { BridgeConfig } from '../config.js';
import type { SessionRecord } from '../session/sessionTypes.js';

export type ClaudeRunResult = {
  readonly sessionId: string;
  readonly result: string;
};

type ClaudeJsonResult = {
  readonly is_error?: boolean;
  readonly result?: string;
  readonly session_id?: string;
};

type ClaudeStreamEnvelope = {
  readonly type?: string;
  readonly subtype?: string;
  readonly is_error?: boolean;
  readonly result?: string;
  readonly session_id?: string;
  readonly event?: {
    readonly type?: string;
    readonly delta?: {
      readonly type?: string;
      readonly text?: string;
    };
  };
};

export type ClaudeStreamEvent =
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'result'; readonly value: ClaudeRunResult }
  | { readonly type: 'error'; readonly message: string };

export type ClaudeStreamHandlers = {
  readonly onTextDelta?: (text: string) => void;
};

const parseClaudeJson = (stdout: string): ClaudeJsonResult => JSON.parse(stdout) as ClaudeJsonResult;

const extractResult = (stdout: string): ClaudeRunResult => {
  const parsed = parseClaudeJson(stdout);

  if (parsed.is_error) {
    throw new Error(parsed.result || 'Claude CLI returned an error');
  }

  if (typeof parsed.session_id !== 'string' || typeof parsed.result !== 'string') {
    throw new Error('Claude CLI returned an unexpected payload');
  }

  return {
    sessionId: parsed.session_id,
    result: parsed.result,
  };
};

const extractErrorMessage = (stdout: string, stderr: string, code: number | null): string => {
  const trimmedStdout = stdout.trim();
  if (trimmedStdout) {
    try {
      const parsed = parseClaudeJson(trimmedStdout);
      if (typeof parsed.result === 'string' && parsed.result.trim()) {
        return parsed.result;
      }
    } catch {
      // Fall through to stderr/code message.
    }
  }

  const trimmedStderr = stderr.trim();
  if (trimmedStderr) {
    return trimmedStderr;
  }

  return `Claude CLI exited with code ${code}`;
};

export const parseClaudeStreamEventLine = (line: string): ClaudeStreamEvent | null => {
  const parsed = JSON.parse(line) as ClaudeStreamEnvelope;

  if (parsed.type === 'stream_event' && parsed.event?.type === 'content_block_delta') {
    if (parsed.event.delta?.type === 'text_delta' && typeof parsed.event.delta.text === 'string') {
      return {
        type: 'text-delta',
        text: parsed.event.delta.text,
      };
    }

    return null;
  }

  if (parsed.type === 'result') {
    if (parsed.is_error) {
      return {
        type: 'error',
        message: parsed.result || 'Claude CLI returned an error',
      };
    }

    if (typeof parsed.session_id === 'string' && typeof parsed.result === 'string') {
      return {
        type: 'result',
        value: {
          sessionId: parsed.session_id,
          result: parsed.result,
        },
      };
    }
  }

  return null;
};

export class ClaudeProcess {
  public constructor(private readonly config: BridgeConfig) {}

  private buildChildEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    if (this.config.anthropicBaseUrl) {
      env.ANTHROPIC_BASE_URL = this.config.anthropicBaseUrl;
    }
    if (this.config.anthropicAuthToken) {
      env.ANTHROPIC_AUTH_TOKEN = this.config.anthropicAuthToken;
    }
    if (this.config.anthropicDefaultOpusModel) {
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = this.config.anthropicDefaultOpusModel;
    }
    if (this.config.anthropicDefaultSonnetModel) {
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = this.config.anthropicDefaultSonnetModel;
    }
    if (this.config.anthropicDefaultHaikuModel) {
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = this.config.anthropicDefaultHaikuModel;
    }

    return env;
  }

  public runPrompt(session: SessionRecord, prompt: string): Promise<ClaudeRunResult> {
    const args = this.buildJsonArgs(session, prompt);

    return new Promise((resolve, reject) => {
      const child = spawn(this.config.claudeCliPath, args, {
        cwd: this.config.projectRoot,
        env: this.buildChildEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Claude CLI timed out'));
      }, this.config.claudeTimeoutMs);

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(extractErrorMessage(stdout, stderr, code)));
          return;
        }

        try {
          resolve(extractResult(stdout));
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  public runPromptStream(
    session: SessionRecord,
    prompt: string,
    handlers: ClaudeStreamHandlers,
  ): Promise<ClaudeRunResult> {
    const args = this.buildStreamArgs(session, prompt);

    return new Promise((resolve, reject) => {
      const child = spawn(this.config.claudeCliPath, args, {
        cwd: this.config.projectRoot,
        env: this.buildChildEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let lineBuffer = '';
      let finalResult: ClaudeRunResult | null = null;
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Claude CLI timed out'));
      }, this.config.claudeTimeoutMs);

      const handleLine = (line: string): void => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }

        const event = parseClaudeStreamEventLine(trimmed);
        if (!event) {
          return;
        }

        if (event.type === 'text-delta') {
          handlers.onTextDelta?.(event.text);
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.message);
        }

        finalResult = event.value;
      };

      child.stdout.on('data', (chunk: Buffer | string) => {
        const text = chunk.toString();
        stdout += text;
        lineBuffer += text;

        while (true) {
          const newlineIndex = lineBuffer.indexOf('\n');
          if (newlineIndex < 0) {
            break;
          }

          const line = lineBuffer.slice(0, newlineIndex);
          lineBuffer = lineBuffer.slice(newlineIndex + 1);
          try {
            handleLine(line);
          } catch (error) {
            clearTimeout(timeout);
            child.kill('SIGTERM');
            reject(error);
            return;
          }
        }
      });

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(extractErrorMessage(stdout, stderr, code)));
          return;
        }

        if (lineBuffer.trim()) {
          try {
            handleLine(lineBuffer);
          } catch (error) {
            reject(error);
            return;
          }
        }

        if (!finalResult) {
          reject(new Error('Claude CLI returned no final result'));
          return;
        }

        resolve(finalResult);
      });
    });
  }

  private buildBaseArgs(session: SessionRecord, prompt: string): string[] {
    const args = ['-p', prompt];

    if (this.config.claudeBareMode) {
      args.unshift('--bare');
    }

    if (session.claudeSessionId) {
      args.push('--resume', session.claudeSessionId);
    }

    args.push('--permission-mode', this.config.claudePermissionMode);

    if (this.config.claudeModel) {
      args.push('--model', this.config.claudeModel);
    }

    if (this.config.claudeSystemPrompt) {
      args.push('--system-prompt', this.config.claudeSystemPrompt);
    }

    if (this.config.claudeAllowedTools.length > 0) {
      args.push('--allowedTools', this.config.claudeAllowedTools.join(','));
    }

    for (const dir of this.config.claudeAddDirs) {
      args.push('--add-dir', dir);
    }

    return args;
  }

  private buildJsonArgs(session: SessionRecord, prompt: string): string[] {
    return [...this.buildBaseArgs(session, prompt), '--output-format', 'json'];
  }

  private buildStreamArgs(session: SessionRecord, prompt: string): string[] {
    return [
      ...this.buildBaseArgs(session, prompt),
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
    ];
  }
}
