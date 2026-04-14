import { describe, expect, it, vi } from 'vitest';
import {
  chunkMessage,
  createStreamingChunkBuffer,
} from '../../src/claude/responseFormatter.js';
import { helpMessage, parseCommand } from '../../src/router/commandRouter.js';


describe('parseCommand', () => {
  it('parses control commands', () => {
    expect(parseCommand('/help')).toEqual({ type: 'help' });
    expect(parseCommand('/status')).toEqual({ type: 'status' });
    expect(parseCommand('/reset')).toEqual({ type: 'reset' });
  });

  it('treats other input as prompt text', () => {
    expect(parseCommand('  hello Claude  ')).toEqual({
      type: 'prompt',
      prompt: 'hello Claude',
    });
  });

  it('returns a readable help message', () => {
    expect(helpMessage()).toContain('/status');
  });
});



describe('createStreamingChunkBuffer', () => {
  it('buffers small deltas until flushed', () => {
    const flush = vi.fn<(text: string) => void>();
    const buffer = createStreamingChunkBuffer({
      flush,
      maxChunkSize: 50,
      minFlushChars: 20,
      flushIntervalMs: 1000,
    });

    buffer.push('hello');
    buffer.push(' world');

    expect(flush).not.toHaveBeenCalled();

    buffer.finish();

    expect(flush).toHaveBeenCalledWith('hello world');
  });

  it('flushes immediately on newline boundaries', () => {
    const flush = vi.fn<(text: string) => void>();
    const buffer = createStreamingChunkBuffer({
      flush,
      maxChunkSize: 50,
      minFlushChars: 100,
      flushIntervalMs: 1000,
    });

    buffer.push('line 1\n');

    expect(flush).toHaveBeenCalledWith('line 1\n');
  });

  it('flushes on timer and preserves order', () => {
    vi.useFakeTimers();
    const flush = vi.fn<(text: string) => void>();
    const buffer = createStreamingChunkBuffer({
      flush,
      maxChunkSize: 50,
      minFlushChars: 100,
      flushIntervalMs: 200,
    });

    buffer.push('hello');
    vi.advanceTimersByTime(199);
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledWith('hello');

    buffer.push(' world');
    buffer.finish();
    expect(flush).toHaveBeenNthCalledWith(2, ' world');
    vi.useRealTimers();
  });
});
