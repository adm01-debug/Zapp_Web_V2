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

  // E100: o evento deixou de ser gravado na ABERTURA da sessão. Contar a abertura inflava
  // `count_searchbox_sessions_this_month()` — o número que degrada o autocomplete em 450 e dispara
  // o alerta de custo em 400 (E91) — fazendo freio e alerta agirem antes de o gasto existir. Agora
  // ele só é gravado quando a sessão vira uso faturado (primeiro `/suggest` ou `/retrieve`).
  it('E35/E100: abrir sessão NÃO grava evento; o evento sai no primeiro uso faturado, com source', () => {
    getSearchSession('contact-form');
    expect(logAudit, 'abrir sessão não pode gravar evento (E98/E100)').not.toHaveBeenCalled();

    noteSuggestCall();
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith({
      action: 'searchbox_session',
      details: { source: 'contact-form' },
    });
  });

  it('E35: reaproveitar a sessão dentro da janela não gera novo evento', () => {
    getSearchSession('picker');
    noteSuggestCall();
    vi.advanceTimersByTime(60_000);
    getSearchSession('picker');
    noteSuggestCall();
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it('E35: sem source explícito, o evento usa "picker" como padrão', () => {
    getSearchSession();
    noteSuggestCall();
    expect(logAudit).toHaveBeenCalledWith({
      action: 'searchbox_session',
      details: { source: 'picker' },
    });
  });

  // E46 · `noteSuggestCall` sem sessão = erro de programação, não sessão fantasma.
  // A sessão nasce em `getSearchSession()`; contar um `/suggest` sem sessão significa que alguém
  // chamou `noteSuggestCall()` antes de abrir a sessão (ou depois de `endSearchSession()`), e a
  // versão antiga criava uma sessão nova com `source='picker'` fixo — inflando sessão e audit.
  describe('E46 — contar request sem sessão ativa', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('em DEV lança erro de programação em noteSuggestCall', () => {
      vi.stubEnv('DEV', true);
      expect(() => noteSuggestCall()).toThrow(/sess[aã]o/i);
    });

    it('em DEV lança erro de programação em noteRetrieveCall', () => {
      vi.stubEnv('DEV', true);
      expect(() => noteRetrieveCall()).toThrow(/sess[aã]o/i);
    });

    it('em DEV não cria sessão fantasma nem registra audit', () => {
      vi.stubEnv('DEV', true);
      expect(() => noteSuggestCall()).toThrow();
      expect(logAudit).not.toHaveBeenCalled();
      // e o estado não foi criado: a próxima sessão de verdade nasce limpa
      const token = getSearchSession('picker');
      expect(logAudit, 'E100: abrir a sessão não grava evento').toHaveBeenCalledTimes(0);
      noteSuggestCall();
      expect(logAudit).toHaveBeenCalledTimes(1);
      expect(logAudit).toHaveBeenCalledWith({
        action: 'searchbox_session',
        details: { source: 'picker' },
      });
      expect(token).toBeTruthy();
    });

    it('em PROD é no-op com console.warn (nunca lança) e não inventa sessão', () => {
      vi.stubEnv('DEV', false);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(() => noteSuggestCall()).not.toThrow();
      expect(warn).toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('em PROD o no-op não conta para o teto de 50 /suggest', () => {
      vi.stubEnv('DEV', false);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      for (let i = 0; i < 60; i += 1) noteSuggestCall();
      expect(warn).toHaveBeenCalledTimes(60);
      const first = getSearchSession('picker');
      noteSuggestCall(); // agora existe sessão: conta de verdade
      noteRetrieveCall();
      const second = getSearchSession('picker');
      expect(second).not.toBe(first); // 1 suggest + retrieve fecha, não 61 suggests
    });
  });
});
