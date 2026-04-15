import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { BridgeService } from '../../src/bridgeService.js';
import type { BridgeConfig } from '../../src/config.js';
import type { ClaudeRunResult } from '../../src/claude/claudeProcess.js';
import { StateFile } from '../../src/persistence/stateFile.js';
import { SessionStore } from '../../src/session/sessionStore.js';
import type { IncomingMessageEvent } from '../../src/lark/types.js';

const makeConfig = (tempDir: string, overrides: Partial<BridgeConfig> = {}): BridgeConfig => ({
  projectRoot: '/tmp/project',
  allowedSenderIds: ['ou_1'],
  allowedChatIds: ['oc_1'],
  botOpenId: 'ou_bot',
  larkCliPath: 'lark-cli',
  claudeCliPath: 'claude',
  claudeBareMode: true,
  claudePermissionMode: 'default',
  claudeModel: null,
  claudeSystemPrompt: null,
  claudeAllowedTools: [],
  claudeAddDirs: [],
  anthropicBaseUrl: null,
  anthropicAuthToken: null,
  anthropicDefaultOpusModel: null,
  anthropicDefaultSonnetModel: null,
  anthropicDefaultHaikuModel: null,
  replyChunkSize: 50,
  minEventIntervalMs: 0,
  streamingFlushIntervalMs: 750,
  streamingMinFlushChars: 120,
  streamingUpdateIntervalMs: 1500,
  claudeTimeoutMs: 1000,
  maxPromptChars: 1000,
  stateFilePath: path.join(tempDir, 'state.json'),
  lockFilePath: path.join(tempDir, 'bridge.lock'),
  ...overrides,
});

const makeEvent = (content: string, eventId = 'evt_1'): IncomingMessageEvent => ({
  type: 'im.message.receive_v1',
  eventId,
  messageId: 'om_1',
  chatId: 'oc_1',
  chatType: null,
  threadId: null,
  senderId: 'ou_1',
  messageType: 'text',
  content,
  createTime: null,
  timestamp: '111',
});

type StreamHandlers = {
  readonly onTextDelta?: (text: string) => void;
};

class FakeClaudeProcess {
  public constructor(
    private readonly result: ClaudeRunResult,
    private readonly streamDeltas: readonly string[] = [],
    private readonly failAfterStreaming = false,
  ) {}

  public async runPrompt(): Promise<ClaudeRunResult> {
    return this.result;
  }

  public async runPromptStream(
    _session: unknown,
    _prompt: string,
    handlers: StreamHandlers,
  ): Promise<ClaudeRunResult> {
    for (const delta of this.streamDeltas) {
      handlers.onTextDelta?.(delta);
    }

    if (this.failAfterStreaming) {
      throw new Error('stream failed');
    }

    return this.result;
  }
}

class FakeReplyClient {
  public readonly replies: string[] = [];
  public readonly cardReplies: string[] = [];
  public readonly updates: Array<{ messageId: string; text: string }> = [];

  public async replyToMessage(_messageId: string, text: string): Promise<string | null> {
    this.replies.push(text);
    return `om_fake_${this.replies.length}`;
  }

  public async replyCardToMessage(_messageId: string, text: string): Promise<string | null> {
    this.cardReplies.push(text);
    return `om_card_${this.cardReplies.length}`;
  }

  public async updateMessage(messageId: string, text: string): Promise<void> {
    this.updates.push({ messageId, text });
  }

  public async updateFinalMessage(messageId: string, text: string): Promise<void> {
    this.updates.push({ messageId, text });
  }
}

describe('BridgeService', () => {
  it('handles prompt, status, reset, and duplicate events', async () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-bridge-service-'));
    const config = makeConfig(tempDir);
    const stateFile = new StateFile(config.stateFilePath);
    const store = new SessionStore(stateFile, config.projectRoot);
    const replyClient = new FakeReplyClient();
    const bridge = new BridgeService(
      config,
      store,
      new FakeClaudeProcess({ sessionId: 'claude-session-1', result: 'hello from claude' }) as never,
      replyClient as never,
    );

    await bridge.handleEvent(makeEvent('hello'));
    // Ack is sent as card reply
    expect(replyClient.cardReplies[0]).toContain('正在思考');
    // Non-streaming: final result sent as update or reply
    const allText = [...replyClient.replies, ...replyClient.updates.map((u) => u.text)].join(' ');
    expect(allText).toContain('hello from claude');
    expect(store.snapshot().sessions.oc_1?.claudeSessionId).toBe('claude-session-1');

    await bridge.handleEvent(makeEvent('/status', 'evt_2'));
    const statusReply = replyClient.replies.find((r) => r.includes('conversation: oc_1'));
    expect(statusReply).toContain('conversation: oc_1');
    const sessionIdReply = replyClient.replies.find((r) => r.includes('claude_session_id'));
    expect(sessionIdReply).toContain('claude_session_id: claude-session-1');

    await bridge.handleEvent(makeEvent('/reset', 'evt_3'));
    const resetReply = replyClient.replies.find((r) => r.includes('Session reset'));
    expect(resetReply).toContain('Session reset');
    expect(store.snapshot().sessions.oc_1).toBeUndefined();

    const duplicateReplies = replyClient.replies.length;
    await bridge.handleEvent(makeEvent('ignored duplicate', 'evt_3'));
    expect(replyClient.replies.length).toBe(duplicateReplies);
  });

  it('rejects unauthorized senders', async () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-bridge-service-'));
    const config = makeConfig(tempDir, { allowedChatIds: [] });
    const stateFile = new StateFile(config.stateFilePath);
    const store = new SessionStore(stateFile, config.projectRoot);
    const replyClient = new FakeReplyClient();
    const bridge = new BridgeService(
      config,
      store,
      new FakeClaudeProcess({ sessionId: 'claude-session-1', result: 'hello from claude' }) as never,
      replyClient as never,
    );

    await expect(
      bridge.handleEvent({
        ...makeEvent('hello'),
        senderId: 'ou_other',
        eventId: 'evt_9',
      }),
    ).rejects.toThrow('sender is not allowed');
  });

  it('returns a safe failure reply when Claude execution fails', async () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-bridge-service-'));
    const config = makeConfig(tempDir);
    const stateFile = new StateFile(config.stateFilePath);
    const store = new SessionStore(stateFile, config.projectRoot);
    const replyClient = new FakeReplyClient();
    const bridge = new BridgeService(
      config,
      store,
      {
        runPrompt: async (): Promise<ClaudeRunResult> => {
          throw new Error('sensitive stderr details');
        },
        runPromptStream: async (): Promise<ClaudeRunResult> => {
          throw new Error('sensitive stderr details');
        },
      } as never,
      replyClient as never,
    );

    await bridge.handleEvent(makeEvent('hello', 'evt_10'));
    expect(replyClient.replies.join('')).toContain('Claude execution failed. Check the bridge logs for details.');
  });


  it('streams partial replies before completion and persists the final session id', async () => {
    vi.useFakeTimers();
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-bridge-service-'));
    const config = makeConfig(tempDir, {
      streamingFlushIntervalMs: 10,
      streamingMinFlushChars: 5,
      streamingUpdateIntervalMs: 0,
    });
    const stateFile = new StateFile(config.stateFilePath);
    const store = new SessionStore(stateFile, config.projectRoot);
    const replyClient = new FakeReplyClient();
    const claudeProcess = new FakeClaudeProcess(
      { sessionId: 'claude-session-2', result: 'hello streaming world' },
      ['hello', ' streaming', ' world'],
    );
    const bridge = new BridgeService(config, store, claudeProcess as never, replyClient as never);

    const promise = bridge.handleEvent(makeEvent('stream this', 'evt_stream_1'));
    await vi.runAllTimersAsync();
    await promise;

    // Ack reply + at least one update
    expect(replyClient.cardReplies.length).toBeGreaterThan(0);
    expect(replyClient.updates.length).toBeGreaterThan(0);
    // Final update should contain the full result
    const lastUpdate = replyClient.updates.at(-1);
    expect(lastUpdate?.text).toContain('hello streaming world');
    expect(store.snapshot().sessions.oc_1?.claudeSessionId).toBe('claude-session-2');
    vi.useRealTimers();
  });


  it('rate limits rapid follow-up events', async () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-bridge-service-'));
    const config = makeConfig(tempDir, { minEventIntervalMs: 1000 });
    const stateFile = new StateFile(config.stateFilePath);
    const store = new SessionStore(stateFile, config.projectRoot);
    const replyClient = new FakeReplyClient();
    const bridge = new BridgeService(
      config,
      store,
      new FakeClaudeProcess({ sessionId: 'claude-session-1', result: 'hello from claude' }) as never,
      replyClient as never,
    );

    await bridge.handleEvent(makeEvent('hello', 'evt_11'));
    await bridge.handleEvent(makeEvent('hello again', 'evt_12'));

    expect(replyClient.replies.join(' ')).toContain('Please wait a moment before sending another messag');
  });
});
