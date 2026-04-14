export type IncomingMessageEvent = {
  readonly type: 'im.message.receive_v1';
  readonly eventId: string;
  readonly messageId: string;
  readonly chatId: string;
  readonly chatType: string | null;
  readonly threadId: string | null;
  readonly senderId: string;
  readonly messageType: string;
  readonly content: string;
  readonly createTime: string | null;
  readonly timestamp: string | null;
};


export type SupportedCommand = 'help' | 'status' | 'reset' | 'prompt';

export type Command =
  | { readonly type: 'help' }
  | { readonly type: 'status' }
  | { readonly type: 'reset' }
  | { readonly type: 'prompt'; readonly prompt: string };
