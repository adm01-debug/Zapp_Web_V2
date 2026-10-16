/**
 * Contador de sussurros do selo — lado DADOS.
 *
 * O selo precisa responder "quantos sussurros EU ainda não li nesta conversa".
 * O defeito era o contrário: o número vinha da lista do painel e somava os
 * sussurros que o próprio usuário enviou (a RLS de SELECT deixa o remetente ver
 * a própria nota). Aqui a consulta é do hook REAL, com o cliente Supabase
 * controlado pelo teste, e prova: filtro exato (destinatário eu, não lido, sem os
 * meus), reconsulta no evento de realtime e no aviso local, e que um erro de
 * leitura não apaga o último número bom (o selo não zera nem inventa).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  count: 0,
  erroLeitura: null as { message: string } | null,
  consultas: 0,
  eqChamadas: [] as Array<[string, unknown]>,
  neqChamadas: [] as Array<[string, unknown]>,
  canalCb: null as null | (() => void),
  selectArgs: null as null | unknown[],
  fromTabela: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      mocks.fromTabela.push(tabela);
      const chain: Record<string, unknown> = {
        eq: (coluna: string, valor: unknown) => {
          mocks.eqChamadas.push([coluna, valor]);
          return chain;
        },
        neq: (coluna: string, valor: unknown) => {
          mocks.neqChamadas.push([coluna, valor]);
          mocks.consultas += 1;
          return {
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve({ count: mocks.count, error: mocks.erroLeitura }).then(resolve),
          };
        },
        select: (...args: unknown[]) => {
          mocks.selectArgs = args;
          return chain;
        },
      };
      return chain;
    },
    channel: () => ({
      on: (_evento: string, _filtro: unknown, cb: () => void) => {
        mocks.canalCb = cb;
        return { subscribe: () => ({}) };
      },
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'me', role: 'supervisor' } }),
}));

import { useWhisperCount, whisperCountKey } from '@/hooks/chat/useWhisperCount';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.count = 0;
  mocks.erroLeitura = null;
  mocks.consultas = 0;
  mocks.eqChamadas = [];
  mocks.neqChamadas = [];
  mocks.canalCb = null;
  mocks.selectArgs = null;
  mocks.fromTabela = [];
  cleanup();
});

describe('useWhisperCount — contador do selo', () => {
  it('conta só os endereçados a mim e não lidos, e exclui os que eu enviei', async () => {
    mocks.count = 2;
    const { result } = renderHook(() => useWhisperCount('c1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current).toBe(2));

    expect(mocks.fromTabela).toEqual(['whisper_messages']);
    expect(mocks.selectArgs).toEqual(['id', { count: 'exact', head: true }]);
    expect(mocks.eqChamadas).toEqual([
      ['contact_id', 'c1'],
      ['target_agent_id', 'me'],
      ['is_read', false],
    ]);
    expect(mocks.neqChamadas).toEqual([['sender_id', 'me']]);
  });

  it('sem contato (ou sem perfil) não consulta o banco e devolve 0', async () => {
    mocks.count = 5;
    const { result } = renderHook(() => useWhisperCount(null), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current).toBe(0));
    expect(mocks.fromTabela).toEqual([]);
    expect(mocks.consultas).toBe(0);
  });

  it('reconsulta quando o realtime avisa de mudança na conversa (selo do destinatário)', async () => {
    mocks.count = 1;
    const { result } = renderHook(() => useWhisperCount('c1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current).toBe(1));
    expect(typeof mocks.canalCb).toBe('function');

    mocks.count = 4;
    await act(async () => {
      mocks.canalCb?.();
    });

    await waitFor(() => expect(result.current).toBe(4));
    expect(mocks.consultas).toBeGreaterThanOrEqual(2);
  });

  it('erro de leitura mantém o último número bom no selo (não zera)', async () => {
    mocks.count = 2;
    const { result } = renderHook(() => useWhisperCount('c1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current).toBe(2));

    const consultasAteAqui = mocks.consultas;
    mocks.count = 0;
    mocks.erroLeitura = { message: 'boom' };
    await act(async () => {
      mocks.canalCb?.();
    });

    await waitFor(() => expect(mocks.consultas).toBeGreaterThan(consultasAteAqui));
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('a chave da consulta é por conversa e por perfil', () => {
    expect(whisperCountKey('c1', 'me')).toEqual(['whisper-count', 'c1', 'me']);
    expect(whisperCountKey('c1', 'me')).not.toEqual(whisperCountKey('c2', 'me'));
  });
});
