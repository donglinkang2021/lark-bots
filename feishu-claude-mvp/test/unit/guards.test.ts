import { describe, expect, it } from 'vitest';
import type { BridgeConfig } from '../../src/config.js';
import { assertEventAllowed } from '../../src/security/guards.js';
import type { IncomingMessageEvent } from '../../src/lark/types.js';

const baseConfig: BridgeConfig = {
  projectRoot: '/tmp/project',
  allowedSenderIds: ['ou_allowed'],
  allowedChatIds: [],
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
  replyChunkSize: 1500,
  minEventIntervalMs: 0,
  streamingFlushIntervalMs: 750,
  streamingMinFlushChars: 120,
  claudeTimeoutMs: 1000,
  maxPromptChars: 1000,
  stateFilePath: '/tmp/state.json',
  lockFilePath: '/tmp/bridge.lock',
};

const baseEvent: IncomingMessageEvent = {
  type: 'im.message.receive_v1',
  eventId: 'evt_1',
  messageId: 'om_1',
  chatId: 'oc_1',
  chatType: null,
  threadId: null,
  senderId: 'ou_allowed',
  messageType: 'text',
  content: 'hello',
  createTime: null,
  timestamp: '111',
};

describe('assertEventAllowed', () => {
  it('allows sender-only allowlists when chat allowlist is empty', () => {
    expect(() => assertEventAllowed(baseConfig, baseEvent)).not.toThrow();
  });

  it('rejects unknown senders with a specific error', () => {
    expect(() =>
      assertEventAllowed(baseConfig, {
        ...baseEvent,
        senderId: 'ou_other',
      }),
    ).toThrow('sender is not allowed');
  });

  it('enforces chat allowlist only when configured', () => {
    expect(() =>
      assertEventAllowed(
        {
          ...baseConfig,
          allowedChatIds: ['oc_allowed'],
        },
        baseEvent,
      ),
    ).toThrow('chat is not allowed');
  });
});
