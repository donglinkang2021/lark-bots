import type { StateFile } from '../persistence/stateFile.js';
import type { IncomingMessageEvent } from '../lark/types.js';
import type { PersistedState, SessionRecord, SessionStatus, RenderMode } from './sessionTypes.js';

const MAX_PROCESSED_EVENTS = 200;

const nowIso = (): string => new Date().toISOString();

const conversationKeyFor = (event: IncomingMessageEvent): string =>
  event.threadId ? `${event.chatId}:${event.threadId}` : event.chatId;

export class SessionStore {
  private state: PersistedState;

  public constructor(private readonly stateFile: StateFile, private readonly projectRoot: string) {
    this.state = this.stateFile.load();
  }

  public hasProcessedEvent(eventId: string): boolean {
    return this.state.processedEventIds.includes(eventId);
  }

  public markProcessed(eventId: string): void {
    const next = [...this.state.processedEventIds.filter((existing) => existing !== eventId), eventId];
    this.state = {
      ...this.state,
      processedEventIds: next.slice(-MAX_PROCESSED_EVENTS),
    };
    this.persist();
  }

  public getOrCreateSession(event: IncomingMessageEvent): SessionRecord {
    const key = conversationKeyFor(event);
    const existing = this.state.sessions[key];
    if (existing) {
      // Back-fill renderMode for sessions created before the field existed
      if (!existing.renderMode) {
        const patched: SessionRecord = { ...existing, renderMode: 'card' as RenderMode };
        this.state = {
          ...this.state,
          sessions: { ...this.state.sessions, [key]: patched },
        };
        this.persist();
        return patched;
      }

      // Back-fill workingDir for sessions created before the field existed
      if (existing.workingDir === undefined) {
        const patched: SessionRecord = { ...existing, workingDir: null };
        this.state = {
          ...this.state,
          sessions: { ...this.state.sessions, [key]: patched },
        };
        this.persist();
        return patched;
      }

      return existing;
    }

    const created: SessionRecord = {
      conversationKey: key,
      chatId: event.chatId,
      threadId: event.threadId,
      senderId: event.senderId,
      projectRoot: this.projectRoot,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      claudeSessionId: null,
      status: 'idle',
      lastMessageId: event.messageId,
      lastEventAt: event.timestamp,
      renderMode: 'card',
      workingDir: null,
    };

    this.state = {
      ...this.state,
      sessions: {
        ...this.state.sessions,
        [key]: created,
      },
    };
    this.persist();
    return created;
  }

  public getSession(event: IncomingMessageEvent): SessionRecord | undefined {
    return this.state.sessions[conversationKeyFor(event)];
  }

  public resetSession(event: IncomingMessageEvent): void {
    const key = conversationKeyFor(event);
    const nextSessions = { ...this.state.sessions };
    delete nextSessions[key];
    this.state = {
      ...this.state,
      sessions: nextSessions,
    };
    this.persist();
  }

  public updateSession(
    conversationKey: string,
    patch: Partial<SessionRecord> & { readonly status?: SessionStatus },
  ): SessionRecord {
    const existing = this.state.sessions[conversationKey];
    if (!existing) {
      throw new Error(`Unknown session: ${conversationKey}`);
    }

    const next: SessionRecord = {
      ...existing,
      ...patch,
      updatedAt: nowIso(),
    };

    this.state = {
      ...this.state,
      sessions: {
        ...this.state.sessions,
        [conversationKey]: next,
      },
    };
    this.persist();
    return next;
  }

  public snapshot(): PersistedState {
    return this.state;
  }

  private persist(): void {
    this.stateFile.save(this.state);
  }
}
