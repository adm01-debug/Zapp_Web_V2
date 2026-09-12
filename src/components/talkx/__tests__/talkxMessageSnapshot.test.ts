import { describe, expect, it } from 'vitest';
import { talkXMessageSnapshotDisplay } from '../talkxMessageSnapshot';

describe('Talk X message snapshot presentation', () => {
  it('renders the immutable personalized text when the worker persisted it', () => {
    expect(talkXMessageSnapshotDisplay('Olá, Ana!', 'sent')).toBe('Olá, Ana!');
  });

  it.each(['pending', 'sending'])('does not invent content while a %s recipient has no snapshot', (status) => {
    expect(talkXMessageSnapshotDisplay(null, status)).toContain('ainda não foi materializada');
  });

  it('does not substitute the mutable campaign template for legacy history', () => {
    expect(talkXMessageSnapshotDisplay('   ', 'sent')).toBe('O conteúdo histórico desta mensagem não está disponível.');
  });
});
