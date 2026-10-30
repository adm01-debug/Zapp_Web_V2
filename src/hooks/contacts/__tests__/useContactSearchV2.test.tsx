import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CT-011 — busca instantânea de contatos (nome, apelido ou empresa).
 *
 * O teste chama o hook REAL com o cliente Supabase mockado: o caminho é o de
 * produção (`useContactSearchV2` → `ContactService.searchContacts` → RPC
 * `search_contacts`, a mesma RPC que a lista já usa — nada de banco novo).
 * O que se prova aqui:
 *  - a consulta sai no debounce curto (o critério de pronto é ≤ 300 ms) e já na
 *    primeira letra;
 *  - resposta de busca antiga que chega DEPOIS é descartada (ordem invertida) e
 *    o `loading` não fica preso;
 *  - o termo guardado junto do resultado é o que produz o destaque;
 *  - erro da RPC e campo limpo também limpam o carregando;
 *  - a consulta não manda nada que amplie a visibilidade (nada de
 *    `include_legacy` nem filtro de outro cartão).
 */

const h = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: h.rpc },
}));

import {
  CONTACT_SEARCH_DEBOUNCE_MS,
  CONTACT_SEARCH_RESULT_LIMIT,
  highlightMatches,
  useContactSearchV2,
} from '../useContactSearchV2';

type RespostaRpc = { data: unknown; error: unknown };

/** Resposta que o teste decide QUANDO entregar (para controlar a ordem). */
function pendente() {
  let resolver!: (valor: RespostaRpc) => void;
  const promise = new Promise<RespostaRpc>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolver };
}

/** Linha no formato que a RPC `search_contacts` devolve. */
function linha(sobrescreve: Record<string, unknown> = {}) {
  return {
    id: 'contato-1',
    name: 'Ana Souza',
    nickname: 'Aninha',
    surname: null,
    job_title: 'Compras',
    company: 'Brindes Sul',
    phone: '5511999999999',
    email: null,
    avatar_url: null,
    tags: null,
    notes: null,
    contact_type: 'cliente',
    created_at: '2026-10-08T00:00:00Z',
    updated_at: '2026-10-08T00:00:00Z',
    latitude: null,
    longitude: null,
    total_count: 1,
    ...sobrescreve,
  };
}

interface PropsBusca {
  term: string;
  enabled?: boolean;
}

function montarHook(termo: string, opcoes: { enabled?: boolean } = {}) {
  const propsIniciais: PropsBusca = { term: termo, enabled: opcoes.enabled };
  return renderHook(
    ({ term, enabled }: PropsBusca) => useContactSearchV2({ term, enabled }),
    { initialProps: propsIniciais },
  );
}

/** Deixa o debounce passar (o tempo sai do código de produção, não do teste). */
async function avancarDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(CONTACT_SEARCH_DEBOUNCE_MS);
  });
}

/** Entrega uma resposta da RPC e deixa o React processar. */
async function entregar(alvo: { promise: Promise<RespostaRpc>; resolver: (v: RespostaRpc) => void }, valor: RespostaRpc) {
  await act(async () => {
    alvo.resolver(valor);
    await alvo.promise;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  h.rpc.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useContactSearchV2 — busca na primeira letra, no debounce curto', () => {
  it('consulta a RPC local no debounce (≤ 300 ms) e devolve o resultado', async () => {
    expect(CONTACT_SEARCH_DEBOUNCE_MS).toBeLessThanOrEqual(300);

    const resposta = pendente();
    h.rpc.mockReturnValueOnce(resposta.promise);
    const { result, rerender } = montarHook('');

    rerender({ term: 'a' });
    expect(h.rpc).not.toHaveBeenCalled(); // ainda dentro do debounce
    expect(result.current.loading).toBe(true);

    await avancarDebounce();

    expect(h.rpc).toHaveBeenCalledTimes(1);
    const [nomeRpc, params] = h.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(nomeRpc).toBe('search_contacts');
    expect(params).toEqual({
      search_term: 'a',
      sort_field: 'name',
      sort_direction: 'asc',
      page_size: CONTACT_SEARCH_RESULT_LIMIT,
      page_offset: 0,
    });
    // Nada que amplie o que o vendedor vê (o escopo é o da RPC, não do cliente).
    expect(Object.keys(params)).not.toContain('include_legacy');

    await entregar(resposta, { data: [linha()], error: null });

    expect(result.current.results.map((c) => c.name)).toEqual(['Ana Souza']);
    expect(result.current.resolvedTerm).toBe('a');
    expect(result.current.loading).toBe(false);
    expect(result.current.notFound).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('espaço em volta não vira busca e o campo vazio não consulta', async () => {
    const resposta = pendente();
    h.rpc.mockReturnValueOnce(resposta.promise);
    const { result, rerender } = montarHook('   ');

    await avancarDebounce();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.notFound).toBe(false);

    rerender({ term: '  Ana  ' });
    await avancarDebounce();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect((h.rpc.mock.calls[0][1] as Record<string, unknown>).search_term).toBe('Ana');
    await entregar(resposta, { data: [], error: null });
  });
});

describe('useContactSearchV2 — corrida entre buscas', () => {
  it('descarta a resposta antiga que chega DEPOIS da nova (ordem invertida)', async () => {
    const primeira = pendente();
    const segunda = pendente();
    h.rpc.mockReturnValueOnce(primeira.promise).mockReturnValueOnce(segunda.promise);

    const { result, rerender } = montarHook('an');
    await avancarDebounce();
    expect(h.rpc).toHaveBeenCalledTimes(1);

    rerender({ term: 'ana' });
    await avancarDebounce();
    expect(h.rpc).toHaveBeenCalledTimes(2);

    // A resposta NOVA chega primeiro.
    await entregar(segunda, { data: [linha({ id: 'nova', name: 'Ana Nova' })], error: null });
    expect(result.current.resolvedTerm).toBe('ana');

    // A resposta ANTIGA chega depois: não pode sobrescrever nada.
    await entregar(primeira, { data: [linha({ id: 'antiga', name: 'Contato Antigo' })], error: null });

    expect(result.current.resolvedTerm).toBe('ana');
    expect(result.current.results.map((c) => c.id)).toEqual(['nova']);
    expect(result.current.loading).toBe(false);
  });

  it('limpar o campo descarta a busca em voo e não deixa carregando preso', async () => {
    const emVoo = pendente();
    h.rpc.mockReturnValueOnce(emVoo.promise);
    const { result, rerender } = montarHook('a');
    await avancarDebounce();
    expect(result.current.loading).toBe(true);

    rerender({ term: '' });
    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual([]);

    await entregar(emVoo, { data: [linha()], error: null });

    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.notFound).toBe(false);
  });

  it('desmontar o campo descarta a resposta em voo (sem escrever depois de sair da tela)', async () => {
    const emVoo = pendente();
    h.rpc.mockReturnValueOnce(emVoo.promise);
    const erroConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = montarHook('a');
    await avancarDebounce();

    unmount();
    await entregar(emVoo, { data: [linha()], error: null });

    expect(erroConsole).not.toHaveBeenCalled();
    erroConsole.mockRestore();
  });

  it('desligar a busca descarta o que estava em voo e não consulta de novo', async () => {
    const emVoo = pendente();
    h.rpc.mockReturnValueOnce(emVoo.promise);
    const { result, rerender } = montarHook('a');
    await avancarDebounce();

    rerender({ term: 'a', enabled: false });
    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual([]);

    await entregar(emVoo, { data: [linha()], error: null });
    expect(result.current.results).toEqual([]);

    await avancarDebounce();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(result.current.notFound).toBe(false);
  });
});

describe('useContactSearchV2 — erro, vazio e destaque', () => {
  it('erro da RPC fica visível, limpa o carregando e NÃO vira "nada encontrado"', async () => {
    const falha = pendente();
    h.rpc.mockReturnValueOnce(falha.promise);
    const { result } = montarHook('ana');
    await avancarDebounce();

    await entregar(falha, { data: null, error: { message: 'boom' } });

    expect(result.current.error).toEqual({ message: 'boom' });
    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual([]);
    expect(result.current.notFound).toBe(false);
  });

  it('promessa rejeitada (falha de rede) vira erro visível, sem carregando preso', async () => {
    h.rpc.mockRejectedValueOnce(new Error('rede caiu'));
    const { result } = montarHook('ana');
    await avancarDebounce();
    await act(async () => {});

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual([]);
    expect(result.current.notFound).toBe(false);
  });

  it('"nada encontrado" só depois de a busca resolvida voltar vazia', async () => {
    const vazia = pendente();
    h.rpc.mockReturnValueOnce(vazia.promise);
    const { result } = montarHook('zzz');
    await avancarDebounce();
    expect(result.current.notFound).toBe(false); // ainda buscando

    await entregar(vazia, { data: [], error: null });

    expect(result.current.notFound).toBe(true);
    expect(result.current.resolvedTerm).toBe('zzz');
    expect(result.current.loading).toBe(false);
  });

  it('o destaque usa o termo que produziu o resultado (campo ausente = vazio, nunca erro)', async () => {
    const resposta = pendente();
    h.rpc.mockReturnValueOnce(resposta.promise);
    const { result } = montarHook('souza');
    await avancarDebounce();

    await entregar(resposta, {
      data: [linha({ nickname: null, company: null, job_title: null })],
      error: null,
    });

    expect(result.current.highlight('Ana Souza')).toEqual([
      { text: 'Ana ', match: false },
      { text: 'Souza', match: true },
    ]);
    expect(result.current.highlight(null)).toEqual([]);
    expect(result.current.highlight(undefined)).toEqual([]);
  });
});

describe('highlightMatches — trecho encontrado', () => {
  it('destaca já na primeira letra, sem depender de caixa', () => {
    expect(highlightMatches('Ana', 'a')).toEqual([
      { text: 'A', match: true },
      { text: 'n', match: false },
      { text: 'a', match: true },
    ]);
    expect(highlightMatches('ana souza', 'A')).toEqual([
      { text: 'a', match: true },
      { text: 'n', match: false },
      { text: 'a', match: true },
      { text: ' souz', match: false },
      { text: 'a', match: true },
    ]);
  });

  it('destaca o trecho no meio do texto e todas as repetições', () => {
    expect(highlightMatches('Ana Souza', 'souza')).toEqual([
      { text: 'Ana ', match: false },
      { text: 'Souza', match: true },
    ]);
    expect(highlightMatches('Brindes Sul Brindes', 'brindes')).toEqual([
      { text: 'Brindes', match: true },
      { text: ' Sul ', match: false },
      { text: 'Brindes', match: true },
    ]);
  });

  it('trata caractere especial do termo como texto (não como expressão regular)', () => {
    expect(highlightMatches('Bruno (filial)', '(fil')).toEqual([
      { text: 'Bruno ', match: false },
      { text: '(fil', match: true },
      { text: 'ial)', match: false },
    ]);
  });

  it('sem termo ou sem trecho, devolve o texto inteiro sem destaque (e vazio para campo ausente)', () => {
    expect(highlightMatches('Ana', '')).toEqual([{ text: 'Ana', match: false }]);
    expect(highlightMatches('Ana', '   ')).toEqual([{ text: 'Ana', match: false }]);
    expect(highlightMatches('Ana', 'zz')).toEqual([{ text: 'Ana', match: false }]);
    expect(highlightMatches(null, 'a')).toEqual([]);
    expect(highlightMatches(undefined, 'a')).toEqual([]);
    expect(highlightMatches('', 'a')).toEqual([]);
  });
});
