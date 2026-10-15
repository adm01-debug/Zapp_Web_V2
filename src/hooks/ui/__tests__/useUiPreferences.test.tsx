import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * R2-PREF-001 — motor de sincronização das preferências de UI.
 *
 * O `supabase` é fingido com uma cadeia de verdade (`from().select().eq().maybeSingle()`
 * e `from().upsert()`), porque é exatamente por esses canais que a preferência
 * viaja: leitura por linha do usuário e gravação por upsert em `user_id`.
 */
const h = vi.hoisted(() => {
  const estado = {
    uid: 'user-1' as string | null,
    prefs: {} as Record<string, unknown> | null,
    erroLeitura: null as Error | null,
    erroGravacao: null as Error | null,
    adiarLeitura: false,
    liberarLeitura: null as null | (() => void),
  };
  const gravacoes: Array<{ user_id: string; prefs: Record<string, unknown> }> = [];
  const opcoes: unknown[] = [];
  const upsert = vi.fn(async (linha: { user_id: string; prefs: Record<string, unknown> }) => {
    gravacoes.push(linha);
    return estado.erroGravacao ? { error: estado.erroGravacao } : { error: null };
  });
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => {
          if (estado.adiarLeitura) await new Promise<void>(resolver => { estado.liberarLeitura = resolver; });
          if (estado.erroLeitura) return { data: null, error: estado.erroLeitura };
          return { data: estado.prefs ? { prefs: estado.prefs } : null, error: null };
        }),
      })),
    })),
    upsert: (linha: { user_id: string; prefs: Record<string, unknown> }, opt: unknown) => {
      opcoes.push(opt);
      return upsert(linha);
    },
  }));
  const getSession = vi.fn(async () => ({
    data: { session: estado.uid ? { user: { id: estado.uid } } : null },
  }));
  return { estado, gravacoes, opcoes, upsert, from, getSession };
});

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: h.getSession }, from: h.from },
}));

import {
  UI_PREFERENCES_CACHE_KEY,
  UI_PREFERENCES_TABLE,
  UI_PREFERENCES_TIMESTAMPS_KEY,
  __resetUiPreferencesParaTeste,
  atualizarDoServidor,
  enviarPendentes,
  useUiPreferences,
} from '@/hooks/ui/useUiPreferences';

/** Espera o debounce (400ms) + folga, sem depender de relógio falso. */
async function esperarEnvio() {
  await act(async () => { await new Promise(resolver => setTimeout(resolver, 700)); });
}

describe('useUiPreferences — sincronização das preferências de UI com o servidor', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    h.gravacoes.length = 0;
    h.opcoes.length = 0;
    h.estado.uid = 'user-1';
    h.estado.prefs = {};
    h.estado.erroLeitura = null;
    h.estado.erroGravacao = null;
    h.estado.adiarLeitura = false;
    h.estado.liberarLeitura = null;
    // O store é um singleton de módulo: cada cenário começa do zero (e relê o cache).
    __resetUiPreferencesParaTeste();
  });

  it('lê a linha do usuário na tabela criada pela migration e o servidor vence o cache local', async () => {
    localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify({ density: 'comfortable' }));
    h.estado.prefs = { density: 'dense', theme: { preset: 'gx-hacker', borderRadius: 8 } };
    __resetUiPreferencesParaTeste();

    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(h.from).toHaveBeenCalledWith(UI_PREFERENCES_TABLE);
    expect(UI_PREFERENCES_TABLE).toBe('user_ui_preferences');
    expect(result.current.prefs.density).toBe('dense');
    expect(result.current.prefs.theme).toEqual({ preset: 'gx-hacker', borderRadius: 8 });
    // O cache local acompanha a cópia que venceu (boot offline da próxima vez),
    // junto com os carimbos (chave reservada: conta empate e tombstone por chave).
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_CACHE_KEY) ?? '{}')).toEqual({
      density: 'dense',
      theme: { preset: 'gx-hacker', borderRadius: 8 },
      [UI_PREFERENCES_TIMESTAMPS_KEY]: { density: 0, theme: 0 },
    });
  });

  it('sem sessão continua no cache local e NÃO chama o servidor', async () => {
    localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify({ density: 'compact' }));
    h.estado.uid = null;
    __resetUiPreferencesParaTeste();

    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.prefs.density).toBe('compact');

    act(() => { result.current.setPreference('density', 'dense'); });
    await esperarEnvio();

    expect(h.from).not.toHaveBeenCalled();
    expect(h.upsert).not.toHaveBeenCalled();
    // A escolha não se perde: fica no cache local.
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_CACHE_KEY) ?? '{}').density).toBe('dense');
  });

  it('agrupa as escritas num único upsert com o objeto inteiro (não um request por mudança)', async () => {
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.setPreference('density', 'dense');
      result.current.setPreference('signatureEnabled', false);
      result.current.setPreference('shortcuts', { enviar: { key: 'e', modifiers: { ctrlKey: true } } });
    });
    await esperarEnvio();

    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.gravacoes[0].user_id).toBe('user-1');
    // O objeto inteiro viaja com os carimbos (cada escrita carimba a sua chave).
    expect(h.gravacoes[0].prefs).toMatchObject({
      density: 'dense',
      signatureEnabled: false,
      shortcuts: { enviar: { key: 'e', modifiers: { ctrlKey: true } } },
    });
    expect(h.gravacoes[0].prefs[UI_PREFERENCES_TIMESTAMPS_KEY]).toMatchObject({
      density: expect.any(Number),
      signatureEnabled: expect.any(Number),
      shortcuts: expect.any(Number),
    });
    expect(h.opcoes[0]).toEqual({ onConflict: 'user_id' });
  });

  it('canal preservado: gravar uma preferência nova não descarta as anteriores', async () => {
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => { result.current.setPreference('theme', { preset: 'navy', borderRadius: 4 }); });
    await esperarEnvio();
    act(() => { result.current.setPreference('density', 'compact'); });
    await esperarEnvio();

    expect(h.upsert).toHaveBeenCalledTimes(2);
    expect(h.gravacoes[1].prefs).toMatchObject({
      theme: { preset: 'navy', borderRadius: 4 },
      density: 'compact',
    });
  });

  it('corrida: resposta atrasada do servidor não desfaz a edição feita durante a leitura', async () => {
    h.estado.adiarLeitura = true;
    h.estado.prefs = { density: 'dense' };

    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(h.estado.liberarLeitura).toBeTruthy());

    act(() => { result.current.setPreference('density', 'compact'); });
    expect(result.current.prefs.density).toBe('compact');

    await act(async () => { h.estado.liberarLeitura?.(); });
    await waitFor(() => expect(result.current.ready).toBe(true));
    // O servidor dizia 'dense', mas o usuário escolheu 'compact' enquanto lia.
    expect(result.current.prefs.density).toBe('compact');

    await esperarEnvio();
    expect(h.gravacoes[h.gravacoes.length - 1]?.prefs.density).toBe('compact');
  });

  it('falha na leitura não trava o hook nem joga o cache fora', async () => {
    localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify({ density: 'compact' }));
    h.estado.erroLeitura = new Error('sem rede');
    __resetUiPreferencesParaTeste();

    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.error).toBe('sem rede');
    expect(result.current.syncing).toBe(false);
    expect(result.current.prefs.density).toBe('compact');
  });

  it('falha na gravação mantém a pendência e o próximo envio tenta de novo', async () => {
    h.estado.erroGravacao = new Error('gravacao recusada');
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => { result.current.setPreference('density', 'dense'); });
    await esperarEnvio();
    expect(result.current.error).toBe('gravacao recusada');
    expect(h.gravacoes).toHaveLength(1);

    h.estado.erroGravacao = null;
    await act(async () => { await enviarPendentes(); });
    expect(h.gravacoes).toHaveLength(2);
    expect(h.gravacoes[1].prefs.density).toBe('dense');
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('clearPreference tira a chave do objeto enviado (o upsert manda o objeto inteiro)', async () => {
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => { result.current.setPreference('density', 'dense'); });
    await esperarEnvio();

    act(() => { result.current.clearPreference('density'); });
    await esperarEnvio();

    expect(h.gravacoes[h.gravacoes.length - 1]?.prefs.density).toBeUndefined();
    // Só sobra a chave reservada, com o carimbo da remoção (tombstone).
    expect(h.gravacoes[h.gravacoes.length - 1]?.prefs[UI_PREFERENCES_TIMESTAMPS_KEY]).toMatchObject({
      density: expect.any(Number),
    });
    expect(result.current.prefs.density).toBeUndefined();
  });

  it('conflito vence o mais recente por chave: local mais novo sobe, servidor mais novo é adotado', async () => {
    localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify({
      density: 'compact',
      theme: { preset: 'corporate', borderRadius: 14 },
      [UI_PREFERENCES_TIMESTAMPS_KEY]: { density: 2000, theme: 1000 },
    }));
    h.estado.prefs = {
      density: 'dense',
      theme: { preset: 'sunset', borderRadius: 6 },
      [UI_PREFERENCES_TIMESTAMPS_KEY]: { density: 1000, theme: 2000 },
    };
    __resetUiPreferencesParaTeste();

    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));

    // density: carimbo local (2000) > conta (1000) — fica o local...
    expect(result.current.prefs.density).toBe('compact');
    // theme: carimbo da conta (2000) > local (1000) — adota a conta.
    expect(result.current.prefs.theme).toEqual({ preset: 'sunset', borderRadius: 6 });

    // ...e o que o local venceu sobe para a conta sem o usuário mexer de novo.
    await esperarEnvio();
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.gravacoes[0].prefs).toMatchObject({
      density: 'compact',
      theme: { preset: 'sunset', borderRadius: 6 },
    });
  });

  it('valor que só existe no cache (formato antigo, sem carimbos) é enviado à conta', async () => {
    localStorage.setItem(UI_PREFERENCES_CACHE_KEY, JSON.stringify({ signatureEnabled: false }));
    h.estado.prefs = {};
    __resetUiPreferencesParaTeste();

    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.prefs.signatureEnabled).toBe(false);

    await esperarEnvio();
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.gravacoes[0].prefs.signatureEnabled).toBe(false);
  });

  it('edição offline recarregada antes de subir não se perde (o carimbo do cache vence a conta)', async () => {
    h.estado.prefs = {
      density: 'dense',
      [UI_PREFERENCES_TIMESTAMPS_KEY]: { density: 1000 },
    };
    h.estado.erroLeitura = new Error('offline');
    __resetUiPreferencesParaTeste();

    const offline = renderHook(() => useUiPreferences());
    await waitFor(() => expect(offline.result.current.ready).toBe(true));
    act(() => { offline.result.current.setPreference('density', 'compact'); });
    await esperarEnvio();
    // Sem leitura, nada sai para a conta (a fila espera)...
    expect(h.upsert).not.toHaveBeenCalled();
    offline.unmount();

    // ...recarrega a aba: o cache gravado (carimbado com a hora da edição) é relido...
    h.estado.erroLeitura = null;
    __resetUiPreferencesParaTeste();
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));

    // ...o carimbo local (agora) é mais novo que o da conta (1000): fica o local e sobe.
    expect(result.current.prefs.density).toBe('compact');
    await esperarEnvio();
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.gravacoes[0].prefs.density).toBe('compact');
  });

  it('sem leitura bem-sucedida o envio NÃO sai (não sobrescreve chaves da conta nunca lidas)', async () => {
    h.estado.prefs = { theme: { preset: 'navy', borderRadius: 4 } };
    h.estado.erroLeitura = new Error('offline');
    __resetUiPreferencesParaTeste();

    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => { result.current.setPreference('density', 'compact'); });
    await act(async () => { await enviarPendentes(); });
    // A fila espera: nenhum upsert com o objeto do cache sai para a conta.
    expect(h.upsert).not.toHaveBeenCalled();

    // A rede volta: a releitura traz a base e SÓ então o objeto completo sobe, mesclado.
    h.estado.erroLeitura = null;
    await act(async () => { await atualizarDoServidor(); });
    await esperarEnvio();
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.gravacoes[0].prefs).toMatchObject({
      density: 'compact',
      theme: { preset: 'navy', borderRadius: 4 },
    });
  });

  it('storage bloqueado na leitura: degrada para prefs vazio sem quebrar', async () => {
    const leitura = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    try {
      __resetUiPreferencesParaTeste();
      const { result } = renderHook(() => useUiPreferences());
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.prefs.density).toBeUndefined();
    } finally {
      leitura.mockRestore();
    }
  });

  it('storage bloqueado na escrita: a conta continua recebendo a preferência', async () => {
    const { result } = renderHook(() => useUiPreferences());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const escrita = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      act(() => { result.current.setPreference('density', 'dense'); });
      await esperarEnvio();
    } finally {
      escrita.mockRestore();
    }

    expect(result.current.prefs.density).toBe('dense');
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.gravacoes[0].prefs.density).toBe('dense');
  });
});
