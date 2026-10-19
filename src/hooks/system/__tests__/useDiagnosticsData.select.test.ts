import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * N-216 — Diagnósticos: select explícito em whatsapp_connections.
 *
 * Antes: `.select('*')` na listagem e na contagem. Depois: a listagem usa só as
 * colunas do tipo ConnectionStatus (a tela mostra instance_id, status,
 * phone_number e created_at) e a contagem pede apenas `id` com head:true
 * (nenhuma linha volta ao navegador).
 */

const selects = vi.hoisted(() => [] as Array<{ table: string; cols: string }>);
const cfg = vi.hoisted(() => ({ connectionsCountError: null as null | { message: string; code: string } }));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let cols = '';
    const b: Record<string, unknown> = {};
    b.select = (c: string) => { selects.push({ table, cols: c }); cols = c; return b; };
    for (const m of ['order', 'limit', 'eq', 'neq', 'gte', 'lt', 'lte', 'is', 'in', 'not', 'filter']) {
      b[m] = () => b;
    }
    b.then = (resolve: (v: unknown) => unknown) => {
      // A contagem (head:true) pede só `id`: é nela que o erro é injetado.
      const err = table === 'whatsapp_connections' && cols === 'id' ? cfg.connectionsCountError : null;
      return Promise.resolve({ data: [], error: err, count: err ? null : 0 }).then(resolve);
    };
    return b;
  };
  const channel = {
    on: () => channel,
    subscribe: (cb: (state: string) => void) => { cb('SUBSCRIBED'); return channel; },
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      channel: () => channel,
      removeChannel: vi.fn(),
      storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }) }) },
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    },
  };
});

import { useDiagnosticsData } from '@/hooks/system/useDiagnosticsData';

describe('useDiagnosticsData — select explícito em whatsapp_connections', () => {
  beforeEach(() => { selects.length = 0; cfg.connectionsCountError = null; });

  it('listagem e contagem não usam select("*")', async () => {
    renderHook(() => useDiagnosticsData());

    await waitFor(() => {
      expect(selects.some(s => s.table === 'whatsapp_connections')).toBe(true);
    });

    const wc = selects.filter(s => s.table === 'whatsapp_connections');
    for (const s of wc) expect(s.cols).not.toBe('*');

    const lista = wc.find(s => s.cols.includes('instance_id'));
    expect(lista).toBeDefined();
    expect(lista!.cols).toContain('id');
    expect(lista!.cols).toContain('status');
    expect(lista!.cols).toContain('phone_number');
    expect(lista!.cols).toContain('created_at');

    // A contagem (head:true) só precisa de uma coluna — nenhuma linha volta.
    expect(wc.some(s => s.cols === 'id')).toBe(true);
  });

  it.todo('falha na contagem de conexões vira erro de banco (não "0 conexões" saudável) — useVisiblePolling engole o erro, health nunca muda para "down"');
});
