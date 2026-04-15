export type SessionStatus = 'idle' | 'running' | 'error';
export type RenderMode = 'card' | 'text';

export type SessionRecord = {
  readonly conversationKey: string;
  readonly chatId: string;
  readonly threadId: string | null;
  readonly senderId: string;
  readonly projectRoot: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly claudeSessionId: string | null;
  readonly lastMessageId: string | null;
  readonly status: SessionStatus;
  readonly lastEventAt: string | null;
  readonly renderMode: RenderMode;
  readonly workingDir: string | null;
};

export type PersistedState = {
  readonly sessions: Record<string, SessionRecord>;
  readonly processedEventIds: readonly string[];
};
