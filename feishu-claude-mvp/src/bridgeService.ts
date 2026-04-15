import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BridgeConfig } from './config.js';
import { ClaudeProcess } from './claude/claudeProcess.js';
import { chunkMessage, createStreamingChunkBuffer } from './claude/responseFormatter.js';

import { ReplyClient } from './lark/replyClient.js';
import type { IncomingMessageEvent } from './lark/types.js';
import { helpMessage, parseCommand } from './router/commandRouter.js';
import { assertEventAllowed } from './security/guards.js';
import { SessionStore } from './session/sessionStore.js';
import type { RenderMode } from './session/sessionTypes.js';
import { logger } from './utils/logger.js';

const SAFE_FAILURE_REPLY = 'Claude execution failed. Check the bridge logs for details.';
const STREAM_FAILURE_REPLY = 'Claude execution ended before completion.';
const RATE_LIMIT_REPLY = 'Please wait a moment before sending another message.';

const conversationKeyForEvent = (event: IncomingMessageEvent): string =>
  event.threadId ? `${event.chatId}:${event.threadId}` : event.chatId;

const resolveWorkingDir = (input: string, projectRoot: string): string | null => {
  if (input === '-') {
    return null;
  }

  if (input.startsWith('~')) {
    return path.join(os.homedir(), input.slice(1));
  }

  if (path.isAbsolute(input)) {
    return input;
  }

  return path.resolve(projectRoot, input);
};

const tryParsePid = (value: string): number | null => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export class BridgeService {
  private readonly lastHandledAt = new Map<string, number>();

  public constructor(
    private readonly config: BridgeConfig,
    private readonly sessionStore: SessionStore,
    private readonly claudeProcess: ClaudeProcess,
    private readonly replyClient: ReplyClient,
  ) {}

  public ensureSingleInstance(): void {
    try {
      fs.writeFileSync(this.config.lockFilePath, `${process.pid}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== 'EEXIST') {
        throw error;
      }

      const existingPid = this.readExistingPid();
      if (existingPid && !this.isPidRunning(existingPid)) {
        fs.unlinkSync(this.config.lockFilePath);
        this.ensureSingleInstance();
        return;
      }

      throw new Error(`Lock file already exists at ${this.config.lockFilePath}`);
    }
  }

  public releaseSingleInstance(): void {
    if (fs.existsSync(this.config.lockFilePath)) {
      fs.unlinkSync(this.config.lockFilePath);
    }
  }

  public async handleEvent(event: IncomingMessageEvent): Promise<void> {
    if (this.sessionStore.hasProcessedEvent(event.eventId)) {
      logger.warn('Skipping duplicate event', { eventId: event.eventId });
      return;
    }

    assertEventAllowed(this.config, event);

    const session = this.sessionStore.getOrCreateSession(event);
    if (this.isRateLimited(session.conversationKey)) {
      await this.sendReply(event.messageId, RATE_LIMIT_REPLY);
      this.sessionStore.markProcessed(event.eventId);
      return;
    }

    const command = parseCommand(event.content);

    if (command.type === 'help') {
      await this.sendReply(event.messageId, helpMessage());
      this.sessionStore.markProcessed(event.eventId);
      return;
    }

    if (command.type === 'status') {
      const currentSession = this.sessionStore.getSession(event);
      const lines = currentSession
        ? [
            `conversation: ${currentSession.conversationKey}`,
            `status: ${currentSession.status}`,
            `render_mode: ${currentSession.renderMode}`,
            `working_dir: ${currentSession.workingDir ?? '(project root)'}`,
            `claude_session_id: ${currentSession.claudeSessionId ?? '(none)'}`,
            `updated_at: ${currentSession.updatedAt}`,
          ]
        : ['No session exists yet for this conversation.'];
      await this.sendReply(event.messageId, lines.join('\n'));
      this.sessionStore.markProcessed(event.eventId);
      return;
    }

    if (command.type === 'reset') {
      this.sessionStore.resetSession(event);
      await this.sendReply(event.messageId, 'Session reset. Send a new message to start a fresh Claude conversation.');
      this.sessionStore.markProcessed(event.eventId);
      return;
    }

    if (command.type === 'markdown') {
      this.sessionStore.updateSession(session.conversationKey, { renderMode: 'text' });
      await this.sendReply(event.messageId, 'Switched to plain text mode. Use /card to switch back to rich card mode.');
      this.sessionStore.markProcessed(event.eventId);
      return;
    }

    if (command.type === 'card') {
      this.sessionStore.updateSession(session.conversationKey, { renderMode: 'card' });
      await this.sendReply(event.messageId, 'Switched to rich card mode. Use /markdown or /md to switch back to plain text mode.');
      this.sessionStore.markProcessed(event.eventId);
      return;
    }

    if (command.type === 'cd') {
      if (!command.path) {
        const currentDir = session.workingDir ?? this.config.projectRoot;
        await this.sendReply(event.messageId, `Current directory: ${currentDir}`);
      } else {
        const resolved = resolveWorkingDir(command.path, this.config.projectRoot);
        if (resolved === null) {
          // Reset to project root — also clear session since cwd changes
          this.sessionStore.updateSession(session.conversationKey, {
            workingDir: null,
            claudeSessionId: null,
          });
          await this.sendReply(event.messageId, `Working directory reset to project root: ${this.config.projectRoot}\n(Claude session cleared — next message starts a fresh conversation)`);
        } else if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
          await this.sendReply(event.messageId, `Directory not found: ${resolved}`);
        } else {
          const hasClaudeConfig = fs.existsSync(path.join(resolved, '.claude'));
          // Clear session since Claude sessions are scoped to working directory
          this.sessionStore.updateSession(session.conversationKey, {
            workingDir: resolved,
            claudeSessionId: null,
          });
          const msg = hasClaudeConfig
            ? `Working directory changed to: ${resolved}\n(.claude/ config detected — will be loaded on next message)\n(Claude session cleared — next message starts a fresh conversation)`
            : `Working directory changed to: ${resolved}\n(Claude session cleared — next message starts a fresh conversation)`;
          await this.sendReply(event.messageId, msg);
        }
      }
      this.sessionStore.markProcessed(event.eventId);
      return;
    }

    const renderMode: RenderMode = session.renderMode;

    this.sessionStore.updateSession(session.conversationKey, {
      status: 'running',
      lastMessageId: event.messageId,
      lastEventAt: event.timestamp ?? null,
    });

    // Send immediate ack so the user knows the message was received
    logger.info('Sending ack reply', { messageId: event.messageId });
    let ackMessageId: string | null = null;
    try {
      ackMessageId = await this.replyClient.replyCardToMessage(event.messageId, '正在思考...', renderMode);
      logger.info('Ack reply sent', { messageId: event.messageId, ackMessageId });
    } catch (error) {
      logger.warn('Failed to send ack reply', {
        messageId: event.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    let streamedAnyOutput = false;
    let replyChain = Promise.resolve();
    let lastUpdateTime = 0;

    try {
      logger.info('Starting Claude execution', {
        messageId: event.messageId,
        conversationKey: session.conversationKey,
        prompt: command.prompt,
      });

      const flushReply = (fullText: string, isFirstFlush: boolean): void => {
        streamedAnyOutput = true;

        replyChain = replyChain.then(async () => {
          try {
            if (isFirstFlush && ackMessageId) {
              // Update the ack message with first real content
              await this.replyClient.updateMessage(ackMessageId, fullText, renderMode);
            } else if (ackMessageId) {
              // Throttle updates to avoid hitting Feishu API rate limits
              const now = Date.now();
              const elapsed = now - lastUpdateTime;
              if (elapsed < this.config.streamingUpdateIntervalMs) {
                return;
              }
              await this.replyClient.updateMessage(ackMessageId, fullText, renderMode);
            } else {
              // No ack message ID — fall back to creating new replies
              for (const chunk of chunkMessage(fullText, this.config.replyChunkSize)) {
                await this.replyClient.replyToMessage(event.messageId, chunk);
              }
            }
            lastUpdateTime = Date.now();
          } catch (error) {
            logger.warn('Failed to update streaming message', {
              messageId: event.messageId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      };

      const streamingBuffer = createStreamingChunkBuffer({
        flush: flushReply,
        minFlushChars: this.config.streamingMinFlushChars,
        flushIntervalMs: this.config.streamingFlushIntervalMs,
      });

      const result = await this.claudeProcess.runPromptStream(session, command.prompt, {
        onTextDelta: (text) => {
          streamingBuffer.push(text);
        },
      });
      streamingBuffer.finish();
      await replyChain;

      // Final update with the complete result — renders LaTeX formulas to images
      if (ackMessageId && result.result.trim()) {
        try {
          await this.replyClient.updateFinalMessage(ackMessageId, result.result, renderMode);
          lastUpdateTime = Date.now();
        } catch (error) {
          logger.warn('Failed to send final update', {
            messageId: event.messageId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info('Claude execution completed', {
        messageId: event.messageId,
        conversationKey: session.conversationKey,
        sessionId: result.sessionId,
        streamedAnyOutput,
      });
      this.sessionStore.updateSession(session.conversationKey, {
        status: 'idle',
        claudeSessionId: result.sessionId,
        lastMessageId: event.messageId,
        lastEventAt: event.timestamp ?? null,
      });
      if (!streamedAnyOutput) {
        await this.sendReply(event.messageId, result.result);
      }
      this.sessionStore.markProcessed(event.eventId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Claude execution failed', {
        messageId: event.messageId,
        conversationKey: session.conversationKey,
        error: message,
      });
      this.sessionStore.updateSession(session.conversationKey, {
        status: 'error',
        lastMessageId: event.messageId,
        lastEventAt: event.timestamp ?? null,
      });
      await this.sendReply(event.messageId, streamedAnyOutput ? STREAM_FAILURE_REPLY : SAFE_FAILURE_REPLY);
      this.sessionStore.markProcessed(event.eventId);
    }
  }

  private readExistingPid(): number | null {
    if (!fs.existsSync(this.config.lockFilePath)) {
      return null;
    }

    return tryParsePid(fs.readFileSync(this.config.lockFilePath, 'utf8'));
  }

  private isPidRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private isRateLimited(conversationKey: string): boolean {
    if (this.config.minEventIntervalMs <= 0) {
      return false;
    }

    const now = Date.now();
    const lastHandledAt = this.lastHandledAt.get(conversationKey);
    this.lastHandledAt.set(conversationKey, now);

    return lastHandledAt !== undefined && now - lastHandledAt < this.config.minEventIntervalMs;
  }

  private async sendReply(messageId: string, text: string): Promise<void> {
    for (const chunk of chunkMessage(text, this.config.replyChunkSize)) {
      await this.replyClient.replyToMessage(messageId, chunk);
    }
  }
}
