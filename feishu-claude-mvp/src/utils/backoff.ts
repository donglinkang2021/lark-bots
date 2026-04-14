export const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const nextBackoff = (attempt: number, baseMs = 1_000, maxMs = 30_000): number => {
  const boundedAttempt = Math.max(0, attempt);
  return Math.min(maxMs, baseMs * (2 ** boundedAttempt));
};
