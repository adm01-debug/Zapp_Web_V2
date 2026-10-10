import { describe, expect, it, vi } from 'vitest';
import { chunkEmailIds, collectEmailPages } from '@/lib/emailPagination';

describe('emailPagination', () => {
  it('continua além dos primeiros mil registros sem duplicar limites inclusivos', async () => {
    const source = Array.from({ length: 2_205 }, (_, index) => index);
    const fetchPage = vi.fn(async (from: number, to: number) => source.slice(from, to + 1));

    const result = await collectEmailPages(fetchPage, 1_000);

    expect(result).toHaveLength(2_205);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(2_204);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1_000, 1_999);
  });

  it('divide ids para evitar URLs e filtros IN excessivos', () => {
    const chunks = chunkEmailIds(Array.from({ length: 1_201 }, (_, index) => `id-${index}`), 500);
    expect(chunks.map(chunk => chunk.length)).toEqual([500, 500, 201]);
  });
});
