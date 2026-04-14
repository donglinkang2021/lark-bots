export const chunkMessage = (message: string, maxChunkSize: number): readonly string[] => {
  if (message.trim().length === 0) {
    return ['(empty response)'];
  }

  if (message.length <= maxChunkSize) {
    return [message];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < message.length) {
    let end = Math.min(message.length, cursor + maxChunkSize);
    if (end < message.length) {
      const breakIndex = message.lastIndexOf('\n', end);
      if (breakIndex > cursor + Math.floor(maxChunkSize / 2)) {
        end = breakIndex;
      }
    }

    chunks.push(message.slice(cursor, end));
    cursor = end;
  }

  return chunks.filter((chunk) => chunk.length > 0);
};


export type StreamingChunkBuffer = {
  readonly push: (text: string) => void;
  readonly finish: () => void;
};

export type StreamingChunkBufferOptions = {
  readonly flush: (text: string) => void;
  readonly maxChunkSize: number;
  readonly minFlushChars: number;
  readonly flushIntervalMs: number;
};

export const createStreamingChunkBuffer = (options: StreamingChunkBufferOptions): StreamingChunkBuffer => {
  let buffer = '';
  let timer: NodeJS.Timeout | null = null;

  const clearTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flushBuffer = (): void => {
    clearTimer();
    const next = buffer;
    buffer = '';
    if (next.trim().length === 0) {
      return;
    }

    for (const chunk of chunkMessage(next, options.maxChunkSize)) {
      options.flush(chunk);
    }
  };

  const scheduleFlush = (): void => {
    if (timer || options.flushIntervalMs <= 0) {
      return;
    }

    timer = setTimeout(() => {
      flushBuffer();
    }, options.flushIntervalMs);
  };

  const shouldFlushImmediately = (): boolean => {
    const raw = buffer;
    const trimmed = raw.trim();
    return raw.endsWith('\n') || trimmed.length >= options.minFlushChars;
  };

  return {
    push(text: string): void {
      buffer += text;
      if (shouldFlushImmediately()) {
        flushBuffer();
        return;
      }

      scheduleFlush();
    },
    finish(): void {
      flushBuffer();
    },
  };
};
