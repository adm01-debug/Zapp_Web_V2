import { describe, expect, it, vi } from 'vitest';
import { fetchAllTalkXPages, TALKX_PAGE_SIZE } from '../paginacao';

/**
 * HZ2-012/HZ2-013 — o PostgREST corta a resposta no teto de linhas do projeto
 * (1000) e NÃO avisa. Uma consulta sem `range` devolve um recorte silencioso:
 * 1500 linhas viram 1000 na tela e o operador não tem como saber.
 *
 * Este é o mesmo recorte do servidor: cada `range(from,to)` devolve no máximo
 * `CAP` linhas e no máximo `to - from + 1`.
 */
const CAP = 1000;

function fakeServer(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: `r${i}`, created_at: `2026-09-${String((i % 28) + 1).padStart(2, '0')}` }));
  const calls: Array<[number, number]> = [];
  const buildPage = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + CAP, total)), error: null });
  };
  return { rows, calls, buildPage };
}

describe('fetchAllTalkXPages — lista completa acima do teto do PostgREST', () => {
  it('traz 1500 linhas em 2 fatias (1000 + 500), sem repetir nem perder linha', async () => {
    const { rows, calls, buildPage } = fakeServer(1500);

    const result = await fetchAllTalkXPages<{ id: string }>(buildPage);

    expect(result).toHaveLength(1500);
    expect(new Set(result.map((r) => r.id)).size).toBe(1500);
    expect(result.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    // A 2ª fatia vem incompleta (500 < 1000): o laço para sem uma 3ª ida ao servidor.
    expect(calls).toEqual([
      [0, TALKX_PAGE_SIZE - 1],
      [TALKX_PAGE_SIZE, TALKX_PAGE_SIZE * 2 - 1],
    ]);
  });

  it('para na fatia vazia quando o total é múltiplo exato do tamanho da página', async () => {
    const { calls, buildPage } = fakeServer(2000);

    const result = await fetchAllTalkXPages<{ id: string }>(buildPage);

    expect(result).toHaveLength(2000);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual([2000, 2999]);
  });

  it('propaga o erro do servidor em vez de devolver lista curta em silêncio', async () => {
    const buildPage = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied for table talkx_blacklist' } });

    await expect(fetchAllTalkXPages(buildPage)).rejects.toThrow('permission denied for table talkx_blacklist');
  });
});
