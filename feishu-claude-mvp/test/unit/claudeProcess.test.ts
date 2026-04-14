import { describe, expect, it } from 'vitest';
import {
  parseClaudeStreamEventLine,
  type ClaudeRunResult,
} from '../../src/claude/claudeProcess.js';

describe('parseClaudeStreamEventLine', () => {
  it('emits text deltas from stream-json lines', () => {
    expect(
      parseClaudeStreamEventLine(
        JSON.stringify({
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            delta: {
              type: 'text_delta',
              text: 'hello',
            },
          },
        }),
      ),
    ).toEqual({ type: 'text-delta', text: 'hello' });
  });

  it('emits final result payloads from result lines', () => {
    const result: ClaudeRunResult = {
      sessionId: 'session-1',
      result: 'done',
    };

    expect(
      parseClaudeStreamEventLine(
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          session_id: result.sessionId,
          result: result.result,
        }),
      ),
    ).toEqual({ type: 'result', value: result });
  });

  it('emits structured errors from error result lines', () => {
    expect(
      parseClaudeStreamEventLine(
        JSON.stringify({
          type: 'result',
          is_error: true,
          result: 'Failed to authenticate',
        }),
      ),
    ).toEqual({
      type: 'error',
      message: 'Failed to authenticate',
    });
  });

  it('ignores unrelated stream-json lines', () => {
    expect(
      parseClaudeStreamEventLine(
        JSON.stringify({
          type: 'stream_event',
          event: {
            type: 'message_start',
          },
        }),
      ),
    ).toBeNull();
  });

  it('rejects malformed json lines', () => {
    expect(() => parseClaudeStreamEventLine('{not json')).toThrow();
  });
});

