import { describe, it, expect } from 'vitest';
import { fetchAllRows } from '../fetchAllRows';

const PAGE = 1000;

function dataset(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: i }));
}

/** Servidor falso: devolve a fatia pedida, como o PostgREST faria com `range`. */
function server(rows: { id: number }[], failOnPage?: number) {
  return async (from: number, to: number) => {
    if (failOnPage !== undefined && from === failOnPage * PAGE) {
      return { data: null, error: { message: 'timeout' } };
    }
    return { data: rows.slice(from, to + 1), error: null };
  };
}

describe('fetchAllRows', () => {
  it('lê todas as páginas e devolve o total real (não só a primeira)', async () => {
    const r = await fetchAllRows(server(dataset(2500)));
    expect(r.rows).toHaveLength(2500);
    expect(r.rows[2499].id).toBe(2499);
    expect(r.incomplete).toBe(false);
    expect(r.error).toBeUndefined();
  });

  it('não confunde conjunto vazio com falha', async () => {
    const r = await fetchAllRows(server([]));
    expect(r.rows).toHaveLength(0);
    expect(r.incomplete).toBe(false);
  });

  it('tamanho exato do múltiplo da página também é completo', async () => {
    const r = await fetchAllRows(server(dataset(2000)));
    expect(r.rows).toHaveLength(2000);
    expect(r.incomplete).toBe(false);
  });

  it('erro no meio do caminho para a leitura e marca incompleto, preservando o que já veio', async () => {
    const r = await fetchAllRows(server(dataset(2500), 1)); // falha na 2ª página
    expect(r.rows).toHaveLength(PAGE);
    expect(r.incomplete).toBe(true);
    expect(r.error?.message).toBe('timeout');
  });

  it('teto de páginas também é incompleto (trava de segurança)', async () => {
    const r = await fetchAllRows(server(dataset(5000)), { maxPages: 2 });
    expect(r.rows).toHaveLength(2 * PAGE);
    expect(r.incomplete).toBe(true);
    expect(r.error).toBeUndefined();
  });
});
