import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

import { logAudit } from '@/lib/audit';
import {
  getSearchSession,
  noteSuggestCall,
  noteRetrieveCall,
  endSearchSession,
  resetSearchSessionForTests,
} from '../mapboxSession';

describe('mapboxSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSearchSessionForTests();
    vi.mocked(logAudit).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('duas chamadas dentro de 2 min compartilham o mesmo token', () => {
    const first = getSearchSession();
    vi.advanceTimersByTime(60_000);
    const second = getSearchSession();
    expect(second).toBe(first);
  });

  it('inatividade maior que 2 min abre uma sessão nova', () => {
    const first = getSearchSession();
    vi.advanceTimersByTime(121_000);
    const second = getSearchSession();
    expect(second).not.toBe(first);
  });

  it('depois de um /retrieve, a próxima sessão é nova', () => {
    const first = getSearchSession();
    noteRetrieveCall();
    const second = getSearchSession();
    expect(second).not.toBe(first);
  });

  it('ao bater 50 /suggest na sessão, a próxima chamada abre sessão nova', () => {
    const first = getSearchSession();
    for (let i = 0; i < 51; i += 1) noteSuggestCall();
    const second = getSearchSession();
    expect(second).not.toBe(first);
  });

  it('endSearchSession encerra a sessão corrente: a próxima chamada é token novo', () => {
    const first = getSearchSession();
    endSearchSession();
    const second = getSearchSession();
    expect(second).not.toBe(first);
  });

  it('não fica preso em loop de sessão nova a cada chamada dentro da janela', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      tokens.add(getSearchSession());
      vi.advanceTimersByTime(1_000);
    }
    expect(tokens.size).toBe(1);
  });

  it('E35: abrir sessão nova registra searchbox_session em audit_logs, com source', () => {
    getSearchSession('contact-form');
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith({
      action: 'searchbox_session',
      details: { source: 'contact-form' },
    });
  });

  it('E35: reaproveitar a sessão dentro da janela não gera novo evento', () => {
    getSearchSession('picker');
    vi.advanceTimersByTime(60_000);
    getSearchSession('picker');
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it('E35: sem source explícito, o evento usa "picker" como padrão', () => {
    getSearchSession();
    expect(logAudit).toHaveBeenCalledWith({
      action: 'searchbox_session',
      details: { source: 'picker' },
    });
  });
});
