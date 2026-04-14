import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { StateFile } from '../../src/persistence/stateFile.js';
import { SessionStore } from '../../src/session/sessionStore.js';
import type { IncomingMessageEvent } from '../../src/lark/types.js';

const makeEvent = (): IncomingMessageEvent => ({
  type: 'im.message.receive_v1',
  eventId: 'evt_1',
  messageId: 'om_1',
  chatId: 'oc_1',
  chatType: null,
  threadId: null,
  senderId: 'ou_1',
  messageType: 'text',
  content: 'hello',
  createTime: null,
  timestamp: '111',
});

describe('SessionStore', () => {
  it('creates, updates, resets, and deduplicates sessions', () => {
    const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-session-store-'));
    const stateFile = new StateFile(path.join(tempDir, 'state.json'));
    const store = new SessionStore(stateFile, '/tmp/project');
    const event = makeEvent();

    const session = store.getOrCreateSession(event);
    expect(session.conversationKey).toBe('oc_1');

    const updated = store.updateSession(session.conversationKey, {
      status: 'running',
      claudeSessionId: 'claude-session-1',
    });
    expect(updated.status).toBe('running');
    expect(updated.claudeSessionId).toBe('claude-session-1');

    expect(store.hasProcessedEvent('evt_1')).toBe(false);
    store.markProcessed('evt_1');
    expect(store.hasProcessedEvent('evt_1')).toBe(true);

    store.resetSession(event);
    expect(store.getSession(event)).toBeUndefined();
  });
});
