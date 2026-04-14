import { describe, expect, it } from 'vitest';

describe('Lark bot identity wiring', () => {
  it('uses explicit bot identity for event subscription command', () => {
    const args = [
      'event',
      '+subscribe',
      '--as',
      'bot',
      '--event-types',
      'im.message.receive_v1',
      '--compact',
      '--quiet',
    ];

    expect(args).toContain('--as');
    expect(args).toContain('bot');
  });

  it('uses explicit bot identity for reply command', () => {
    const args = ['im', '+messages-reply', '--as', 'bot', '--message-id', 'om_xxx', '--text', 'hello'];

    expect(args).toContain('--as');
    expect(args).toContain('bot');
  });
});
