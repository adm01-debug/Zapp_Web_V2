import { describe, it, expect, vi } from 'vitest';
import { publishTypingByUser, subscribeTypingByUser, clearTypingByUser } from '../typingPresenceStore';

describe('typingPresenceStore', () => {
  it('entrega o valor atual na hora de assinar, mesmo sem publicação prévia', () => {
    const cb = vi.fn();
    const unsub = subscribeTypingByUser('nova-conversa', cb);
    expect(cb).toHaveBeenCalledWith({});
    unsub();
  });

  it('notifica só os assinantes da MESMA conversa', () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    const unsubA = subscribeTypingByUser('a', cbA);
    const unsubB = subscribeTypingByUser('b', cbB);
    cbA.mockClear();
    cbB.mockClear();

    publishTypingByUser('a', { ana: true });

    expect(cbA).toHaveBeenCalledWith({ ana: true });
    expect(cbB).not.toHaveBeenCalled();
    unsubA();
    unsubB();
  });

  it('clearTypingByUser esvazia e notifica vazio', () => {
    const cb = vi.fn();
    publishTypingByUser('c', { ana: true });
    const unsub = subscribeTypingByUser('c', cb);
    expect(cb).toHaveBeenCalledWith({ ana: true });

    clearTypingByUser('c');
    expect(cb).toHaveBeenLastCalledWith({});

    // quem assina DEPOIS do clear não vê a presença velha
    const cb2 = vi.fn();
    const unsub2 = subscribeTypingByUser('c', cb2);
    expect(cb2).toHaveBeenCalledWith({});
    unsub();
    unsub2();
  });

  it('unsubscribe para de notificar', () => {
    const cb = vi.fn();
    const unsub = subscribeTypingByUser('d', cb);
    cb.mockClear();
    unsub();
    publishTypingByUser('d', { bruno: true });
    expect(cb).not.toHaveBeenCalled();
  });
});
