import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `useWhisperCount` — o selo de sussurros do cabeçalho.
 *
 * O contador é o valor que a RLS já deixa visível (`count`/`head`, sem trazer conteúdo). O que
 * estes testes trancam é o comportamento de TROCA de conversa: o número carregado é marcado com
 * o contato de origem, para o selo não mostrar a contagem da conversa anterior enquanto a nova
 * carrega — e o barramento local (`notificarSussurroEnviado`, o caminho de atualização de quem
 * já está na conversa, já que `whisper_messages` não está na publicação de realtime) só
 * reconsulta a conversa aberta.
 *
 * O caso "conta e reconsulta quando um sussurro novo é gravado" já existe em
 * `src/components/inbox/chat/__tests__/useChatPanelHandlers.sussurro.test.tsx`; aqui ficam os
 * ramos que aquele arquivo não alcança.
 */

const mocks = vi.hoisted(() => ({
  /** Resposta do banco por contato (a consulta é `count`/`head`, sem linha de conteúdo). */
  resposta: new Map<string, { count: number; error: unknown }>(),
  /** Quando ligado, a próxima consulta fica pendente até `resolver` ser chamado. */
  pendurarProxima: false,
  resolver: undefined as ((valor: { count: number; error: unknown }) => void) | undefined,
  consultas: [] as string[],
  logError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_coluna: string, contactId: string) => {
          mocks.consultas.push(contactId);
          if (mocks.pendurarProxima) {
            mocks.pendurarProxima = false;
            return new Promise((resolve) => {
              mocks.resolver = resolve as typeof mocks.resolver;
            });
          }
          return Promise.resolve(mocks.resposta.get(contactId) ?? { count: 0, error: null });
        },
      }),
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: (...args: unknown[]) => mocks.logError(...args) },
}));

const { useWhisperCount, notificarSussurroEnviado } = await import('@/hooks/chat/useWhisperCount');

function contagem(contactId: string, count: number, error: unknown = null) {
  mocks.resposta.set(contactId, { count, error });
}

function consultasDe(contactId: string) {
  return mocks.consultas.filter((id) => id === contactId).length;
}

describe('useWhisperCount — selo de sussurros da conversa', () => {
  beforeEach(() => {
    mocks.resposta.clear();
    mocks.consultas.length = 0;
    mocks.pendurarProxima = false;
    mocks.resolver = undefined;
    mocks.logError.mockClear();
  });

  it('conta as linhas visíveis do contato pela consulta de count/head', async () => {
    contagem('contato-a', 4);
    const { result } = renderHook(() => useWhisperCount('contato-a'));

    await waitFor(() => expect(result.current).toBe(4));
    expect(consultasDe('contato-a')).toBe(1);
  });

  it('trocar de conversa não mostra a contagem da anterior enquanto a nova carrega', async () => {
    contagem('contato-a', 4);
    contagem('contato-b', 7);
    const { result, rerender } = renderHook(({ id }: { id: string }) => useWhisperCount(id), {
      initialProps: { id: 'contato-a' },
    });

    await waitFor(() => expect(result.current).toBe(4));

    // A conversa nova ainda não respondeu: o selo não pode exibir o 4 da conversa anterior.
    mocks.pendurarProxima = true;
    rerender({ id: 'contato-b' });
    expect(result.current).toBe(0);

    await act(async () => {
      mocks.resolver?.({ count: 7, error: null });
    });

    await waitFor(() => expect(result.current).toBe(7));
  });

  it('o barramento local reconsulta só a conversa aberta', async () => {
    contagem('contato-a', 4);
    const { result } = renderHook(() => useWhisperCount('contato-a'));
    await waitFor(() => expect(result.current).toBe(4));

    // Sussurro gravado em OUTRA conversa: não mexe neste selo.
    act(() => {
      notificarSussurroEnviado('contato-b');
    });
    expect(consultasDe('contato-a')).toBe(1);

    contagem('contato-a', 5);
    await act(async () => {
      notificarSussurroEnviado('contato-a');
    });

    await waitFor(() => expect(result.current).toBe(5));
    expect(consultasDe('contato-a')).toBe(2);
  });

  it('sem conversa selecionada não consulta nada e devolve zero', async () => {
    const { result } = renderHook(() => useWhisperCount(null));

    await waitFor(() => expect(result.current).toBe(0));
    expect(mocks.consultas).toEqual([]);
  });

  it('erro na contagem mantém o último número bom e registra a falha', async () => {
    contagem('contato-a', 4);
    const { result } = renderHook(() => useWhisperCount('contato-a'));
    await waitFor(() => expect(result.current).toBe(4));

    contagem('contato-a', 0, { message: 'permission denied' });
    await act(async () => {
      notificarSussurroEnviado('contato-a');
    });

    await waitFor(() => expect(mocks.logError).toHaveBeenCalled());
    expect(result.current).toBe(4);
  });
});
