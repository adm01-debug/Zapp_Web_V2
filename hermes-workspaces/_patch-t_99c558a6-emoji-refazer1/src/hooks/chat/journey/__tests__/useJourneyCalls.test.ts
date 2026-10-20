import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

/**
 * Dublê do cliente Supabase. Registra cada método da consulta E aplica os MESMOS filtros nas
 * linhas (como o PostgREST filtra no servidor), recortando pelo `.range()` — sem isso, um teste
 * de escopo provaria só que o filtro foi ENVIADO, nunca que a linha errada fica de fora.
 * Só o módulo do cliente é mockado; o hook é o de verdade.
 */
const estado = vi.hoisted(() => ({
  registros: [] as Array<{ tabela: string; metodo: string; args: unknown[] }>,
  linhas: {} as Record<string, unknown[]>,
  erro: {} as Record<string, string>,
}));

vi.mock('@/integrations/supabase/client', () => {
  /** Valor de uma coluna, inclusive caminho de relação embutida (`email_threads.contact_id`). */
  const valorDe = (linha: Record<string, unknown>, caminho: string): unknown =>
    caminho.split('.').reduce<unknown>((atual, chave) => {
      if (atual === null || atual === undefined) return undefined;
      return (atual as Record<string, unknown>)[chave];
    }, linha);

  const criarCadeia = (tabela: string) => {
    let faixa: [number, number] | null = null;
    const iguais: Array<[string, unknown]> = [];
    const maiores: Array<[string, string]> = [];
    const menores: Array<[string, string]> = [];

    const registrar = (metodo: string, args: unknown[]) => {
      estado.registros.push({ tabela, metodo, args });
    };

    const combinam = (linha: Record<string, unknown>) =>
      iguais.every(([coluna, valor]) => valorDe(linha, coluna) === valor) &&
      maiores.every(([coluna, limite]) => {
        const atual = valorDe(linha, coluna);
        // NULL/ausente não satisfaz `gte`/`lte` no PostgREST.
        return typeof atual === 'string' && atual !== '' && atual >= limite;
      }) &&
      menores.every(([coluna, limite]) => {
        const atual = valorDe(linha, coluna);
        return typeof atual === 'string' && atual !== '' && atual <= limite;
      });

    const responder = () => {
      if (estado.erro[tabela]) return { data: null, error: { message: estado.erro[tabela] } };
      const linhas = ((estado.linhas[tabela] ?? []) as Record<string, unknown>[]).filter(combinam);
      return { data: faixa ? linhas.slice(faixa[0], faixa[1] + 1) : linhas, error: null };
    };

    const cadeia: Record<string, unknown> = {};
    cadeia.select = (colunas: string) => { registrar('select', [colunas]); return cadeia; };
    cadeia.eq = (coluna: string, valor: unknown) => {
      registrar('eq', [coluna, valor]);
      iguais.push([coluna, valor]);
      return cadeia;
    };
    cadeia.gte = (coluna: string, limite: string) => {
      registrar('gte', [coluna, limite]);
      maiores.push([coluna, limite]);
      return cadeia;
    };
    cadeia.lte = (coluna: string, limite: string) => {
      registrar('lte', [coluna, limite]);
      menores.push([coluna, limite]);
      return cadeia;
    };
    cadeia.order = (coluna: string, opcoes: unknown) => { registrar('order', [coluna, opcoes]); return cadeia; };
    cadeia.range = (from: number, to: number) => {
      registrar('range', [from, to]);
      faixa = [from, to];
      return Promise.resolve(responder());
    };
    // thenable: o hook aguarda a própria cadeia quando não há `.range()`
    cadeia.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(responder()).then(ok, falha);
    return cadeia;
  };

  return { supabase: { from: (tabela: string) => criarCadeia(tabela) } };
});

import { JOURNEY_CALLS_PAGE_SIZE, useJourneyCalls } from '@/hooks/chat/journey/useJourneyCalls';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );

const RANGE = { sinceIso: '2026-10-01T03:00:00.000Z', untilIso: '2026-10-08T02:59:59.999Z' };

function linhaCall(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'liga-1',
    contact_id: 'contato-1',
    direction: 'inbound',
    status: 'ended',
    started_at: '2026-10-05T12:00:00.000Z',
    answered_at: '2026-10-05T12:00:05.000Z',
    ended_at: '2026-10-05T12:01:00.000Z',
    duration_seconds: 60,
    talk_seconds: 55,
    agent_id: 'agente-1',
    answered_by: 'agente-2',
    end_reason: 'completed',
    recording_status: 'none',
    ...over,
  };
}

const filtrosDe = (tabela: string) => estado.registros.filter((r) => r.tabela === tabela);
const idsDe = (linhas: Array<{ id: string }>) => linhas.map((l) => l.id);

beforeEach(() => {
  estado.registros.length = 0;
  estado.linhas = {};
  estado.erro = {};
});

describe('useJourneyCalls — ligações do contato no período', () => {
  it('recorta o intervalo em started_at (gte/lte) e deixa de fora a ligação fora do período', async () => {
    estado.linhas.calls = [
      linhaCall({ id: 'dentro', started_at: '2026-10-05T12:00:00.000Z' }),
      linhaCall({ id: 'antes', started_at: '2026-09-20T12:00:00.000Z' }),
      linhaCall({ id: 'depois', started_at: '2026-10-08T12:00:00.000Z' }),
    ];
    const { result } = renderHook(() => useJourneyCalls({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const filtros = filtrosDe('calls');
    expect(filtros).toContainEqual({ tabela: 'calls', metodo: 'eq', args: ['contact_id', 'contato-1'] });
    expect(filtros).toContainEqual({ tabela: 'calls', metodo: 'gte', args: ['started_at', RANGE.sinceIso] });
    expect(filtros).toContainEqual({ tabela: 'calls', metodo: 'lte', args: ['started_at', RANGE.untilIso] });
    // `.range` sempre acompanhado de ordem determinística (o desempate por `id` é o que
    // impede a página de repetir ou pular linha com data empatada).
    expect(filtros.filter((f) => f.metodo === 'order').map((f) => f.args)).toEqual([
      ['started_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(idsDe(result.current.calls)).toEqual(['dentro']);
  });

  it('não traz ligação de outro contato (o escopo vale na consulta, não na tela)', async () => {
    estado.linhas.calls = [
      linhaCall({ id: 'minha' }),
      linhaCall({ id: 'de-outro', contact_id: 'contato-2' }),
    ];
    const { result } = renderHook(() => useJourneyCalls({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.calls).toHaveLength(1));

    expect(idsDe(result.current.calls)).toEqual(['minha']);
  });

  it('troca de contato não deixa as ligações do contato anterior na lista', async () => {
    estado.linhas.calls = [
      linhaCall({ id: 'do-primeiro' }),
      linhaCall({ id: 'do-segundo', contact_id: 'contato-2' }),
      linhaCall({ id: 'do-segundo-2', contact_id: 'contato-2' }),
    ];
    const { result, rerender } = renderHook(
      (props: { contactId: string }) => useJourneyCalls({ contactId: props.contactId, range: RANGE }),
      { wrapper, initialProps: { contactId: 'contato-1' } },
    );
    await waitFor(() => expect(idsDe(result.current.calls)).toEqual(['do-primeiro']));

    rerender({ contactId: 'contato-2' });
    await waitFor(() => expect(result.current.calls).toHaveLength(2));
    expect(idsDe(result.current.calls).sort()).toEqual(['do-segundo', 'do-segundo-2']);
  });

  it('período aberto não recorta nenhum lado e traz o que o contato tem', async () => {
    estado.linhas.calls = [
      linhaCall({ id: 'antiga', started_at: '2020-01-01T12:00:00.000Z' }),
      linhaCall({ id: 'recente' }),
    ];
    const { result } = renderHook(
      () => useJourneyCalls({ contactId: 'contato-1', range: { sinceIso: null, untilIso: null } }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.calls).toHaveLength(2));

    const metodos = filtrosDe('calls').map((f) => f.metodo);
    expect(metodos).not.toContain('gte');
    expect(metodos).not.toContain('lte');
  });

  it('pagina de 200 em 200, para na página incompleta e mantém o escopo em TODAS as páginas', async () => {
    estado.linhas.calls = Array.from({ length: 450 }, (_, i) => linhaCall({ id: `liga-${i}` }));
    const { result } = renderHook(() => useJourneyCalls({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.calls).toHaveLength(JOURNEY_CALLS_PAGE_SIZE));
    expect(result.current.hasMore).toBe(true);

    await act(async () => { result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.calls).toHaveLength(400));

    await act(async () => { result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.calls).toHaveLength(450));
    await waitFor(() => expect(result.current.hasMore).toBe(false));

    expect(filtrosDe('calls').filter((f) => f.metodo === 'range').map((f) => f.args)).toEqual([
      [0, 199],
      [200, 399],
      [400, 599],
    ]);
    // Cada página refaz a consulta inteira: o mesmo contato e o mesmo intervalo nas três.
    const contar = (metodo: string) => filtrosDe('calls').filter((f) => f.metodo === metodo).length;
    expect(contar('eq')).toBe(3);
    expect(contar('gte')).toBe(3);
    expect(contar('lte')).toBe(3);
  });

  it('não pede `recording_url` ao banco: o `select` só traz o `recording_status`', async () => {
    estado.linhas.calls = [linhaCall()];
    const { result } = renderHook(() => useJourneyCalls({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const select = filtrosDe('calls').find((f) => f.metodo === 'select');
    expect(select).toBeDefined();
    expect(select?.args[0]).toContain('recording_status');
    // É por este `select` que a URL da gravação chegaria ao navegador no payload da rede: ela
    // não pode estar aqui. Quem entrega o arquivo é o caminho de download do sistema, no clique.
    expect(String(select?.args[0] ?? '')).not.toContain('recording_url');
  });

  it('mapeia a linha crua para RawCall: `hasRecording` vem SÓ de `recording_status` e nenhuma URL volta', async () => {
    estado.linhas.calls = [
      linhaCall({ id: 'com-gravacao', recording_status: 'available' }),
      // `none` é o padrão da linha crua (`linhaCall`); `failed` prova que só `available` conta.
      linhaCall({ id: 'sem-gravacao' }),
      linhaCall({ id: 'gravacao-falhou', recording_status: 'failed' }),
      // Linha hostil: mesmo que ela CARREGUE a URL da gravação, ela não vale como gravação
      // (quem manda é o `recording_status`) e a URL não pode aparecer no que o hook devolve.
      linhaCall({
        id: 'url-no-banco',
        recording_status: 'none',
        recording_url: 'https://provedor.exemplo/gravacao/abc.mp3',
      }),
    ];
    const { result } = renderHook(() => useJourneyCalls({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.calls).toHaveLength(4));

    // `hasRecording` = `recording_status === 'available'`, o MESMO sinal do detalhe da ligação.
    const porId = new Map(result.current.calls.map((c) => [c.id, c]));
    expect(porId.get('com-gravacao')?.hasRecording).toBe(true);
    expect(porId.get('sem-gravacao')?.hasRecording).toBe(false);
    expect(porId.get('gravacao-falhou')?.hasRecording).toBe(false);
    expect(porId.get('url-no-banco')?.hasRecording).toBe(false);

    // Nenhuma URL sai do hook — nem o campo (snake/camel), nem o conteúdo.
    for (const ligacao of result.current.calls) {
      expect(ligacao).not.toHaveProperty('recording_url');
      expect(ligacao).not.toHaveProperty('recordingUrl');
      expect(JSON.stringify(ligacao)).not.toContain('gravacao/abc.mp3');
    }

    expect(porId.get('com-gravacao')).toEqual({
      id: 'com-gravacao',
      direction: 'inbound',
      status: 'ended',
      startedAt: '2026-10-05T12:00:00.000Z',
      answeredAt: '2026-10-05T12:00:05.000Z',
      endedAt: '2026-10-05T12:01:00.000Z',
      durationSeconds: 60,
      talkSeconds: 55,
      agentId: 'agente-1',
      answeredBy: 'agente-2',
      endReason: 'completed',
      hasRecording: true,
    });
  });

  it('sem ligação no período: lista vazia, sem erro e sem próxima página', async () => {
    estado.linhas.calls = [];
    const { result } = renderHook(() => useJourneyCalls({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.calls).toEqual([]);
    expect(result.current.isError).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it('erro do banco: lista vazia com isError, sem exceção para a tela', async () => {
    estado.linhas.calls = [linhaCall()];
    estado.erro.calls = 'permission denied for table calls';
    const { result } = renderHook(() => useJourneyCalls({ contactId: 'contato-1', range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.calls).toEqual([]);
  });

  it('sem contato selecionado não consulta e entrega lista vazia', async () => {
    estado.linhas.calls = [linhaCall()];
    const { result } = renderHook(() => useJourneyCalls({ contactId: null, range: RANGE }), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.calls).toEqual([]);
    expect(estado.registros).toEqual([]);
  });
});
