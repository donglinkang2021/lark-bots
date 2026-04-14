import { describe, expect, it } from 'vitest';
import { parseEventLine } from '../../src/lark/eventParser.js';

describe('parseEventLine', () => {
  it('parses a compact IM event', () => {
    const event = parseEventLine(
      JSON.stringify({
        type: 'im.message.receive_v1',
        event_id: 'evt_1',
        message_id: 'om_123',
        chat_id: 'oc_123',
        chat_type: 'p2p',
        sender_id: 'ou_123',
        message_type: 'text',
        content: 'hello',
        create_time: '111',
        timestamp: '222',
      }),
    );

    expect(event).toEqual({
      type: 'im.message.receive_v1',
      eventId: 'evt_1',
      messageId: 'om_123',
      chatId: 'oc_123',
      chatType: 'p2p',
      threadId: null,
      senderId: 'ou_123',
      messageType: 'text',
      content: 'hello',
      createTime: '111',
      timestamp: '222',
    });
  });

  it('falls back to message id when event_id is missing', () => {
    const event = parseEventLine(
      JSON.stringify({
        type: 'im.message.receive_v1',
        message_id: 'om_123',
        chat_id: 'oc_123',
        sender_id: 'ou_123',
        message_type: 'text',
        content: 'hello',
      }),
    );

    expect(event?.eventId).toBe('om_123');
  });

  it('returns undefined for unsupported payloads', () => {
    const event = parseEventLine(
      JSON.stringify({
        type: 'other.event',
        message_id: 'om_123',
      }),
    );

    expect(event).toBeUndefined();
  });
});
