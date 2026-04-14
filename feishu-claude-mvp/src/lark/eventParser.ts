import type { IncomingMessageEvent } from './types.js';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

export const parseEventLine = (line: string): IncomingMessageEvent | undefined => {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return undefined;
  }

  if (parsed.type !== 'im.message.receive_v1') {
    return undefined;
  }

  const messageId = asString(parsed.message_id);
  const chatId = asString(parsed.chat_id);
  const senderId = asString(parsed.sender_id);
  const content = asString(parsed.content);
  const eventId = asString(parsed.event_id) ?? messageId;
  const messageType = asString(parsed.message_type) ?? 'unknown';

  if (!messageId || !chatId || !senderId || !content || !eventId) {
    return undefined;
  }

  return {
    type: 'im.message.receive_v1',
    eventId,
    messageId,
    chatId,
    chatType: asString(parsed.chat_type) ?? null,
    threadId: asString(parsed.thread_id) ?? null,
    senderId,
    messageType,
    content,
    createTime: asString(parsed.create_time) ?? null,
    timestamp: asString(parsed.timestamp) ?? null,
  };
};

