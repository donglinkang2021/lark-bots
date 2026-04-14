import type { BridgeConfig } from '../config.js';
import type { IncomingMessageEvent } from '../lark/types.js';

const normalize = (value: string): string => value.trim().toLowerCase();

export const assertEventAllowed = (config: BridgeConfig, event: IncomingMessageEvent): void => {
  const senderEnforced = config.allowedSenderIds.length > 0;
  const chatEnforced = config.allowedChatIds.length > 0;

  const senderAllowed =
    !senderEnforced ||
    config.allowedSenderIds.some((senderId) => senderId === event.senderId);

  const chatAllowed =
    !chatEnforced ||
    config.allowedChatIds.some((chatId) => chatId === event.chatId);

  if (!senderAllowed) {
    throw new Error(`sender is not allowed: ${event.senderId}`);
  }

  if (!chatAllowed) {
    throw new Error(`chat is not allowed: ${event.chatId}`);
  }

  if (config.botOpenId && normalize(config.botOpenId) === normalize(event.senderId)) {
    throw new Error('ignoring bot self-message');
  }

  if (event.messageType !== 'text') {
    throw new Error(`unsupported message type: ${event.messageType}`);
  }

  if (event.content.length > config.maxPromptChars) {
    throw new Error(`message exceeds max prompt length of ${config.maxPromptChars}`);
  }
};

