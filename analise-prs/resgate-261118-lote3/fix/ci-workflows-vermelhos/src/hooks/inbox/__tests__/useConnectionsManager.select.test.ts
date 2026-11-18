import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * N-216 — Conexões WhatsApp: select explícito na listagem.
 *
 * Antes: `.select('*')` trazia para o navegador colunas que a tela não usa
 * (ex.: o nome do secret do token da instância). Depois: lista explícita só com
 * as colunas que a listagem e as ações de instância usam. `qr_code` NÃO vem na
 * listagem da ponta: o diálogo exibe o QR retornado pelo Edge connectInstance
 * (e pelos eventos realtime), nunca a coluna armazenada.
 */

const selects = vi.hoisted(() => [] as Array<{ table: string; cols: string }>);

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    b.select = (cols: string) => { selects.push({ table, cols }); return b; };
    b.order = () => b;
    b.eq = () => b;
    b.update = () => b;
    b.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    return b;
  };
  const channel = () => {
    const c: Record<string, unknown> = {};
    c.on = () => c;
    c.subscribe = () => c;
    return c;
  };
  return {
    supabase: { from: (t: string) => builder(t), channel, removeChannel: vi.fn() },
  };
});

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    createConnection: vi.fn(),
    connectInstance: vi.fn(),
    getInstanceStatus: vi.fn(),
    disconnectInstance: vi.fn(),
    deleteInstance: vi.fn(),
  }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useConnectionsManager } from '@/hooks/inbox/useConnectionsManager';

describe('useConnectionsManager — select explícito em whatsapp_connections', () => {
  beforeEach(() => { selects.length = 0; });

  it('.select() usa lista explícita (sem select("*"))', async () => {
    renderHook(() => useConnectionsManager());

    await waitFor(() => {
      expect(selects.some(s => s.table === 'whatsapp_connections')).toBe(true);
    });

    const wc = selects.filter(s => s.table === 'whatsapp_connections');
    for (const s of wc) expect(s.cols).not.toBe('*');

    const cols = wc[0].cols;
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('status');
    // instance_id é usada pelas ações de instância — não pode ser removida.
    expect(cols).toContain('instance_id');
    // qr_code e o secret do token nunca voltam na listagem (QR vem do Edge).
    expect(cols).not.toContain('qr_code');
    expect(cols).not.toContain('instance_token_secret_id');
  });
});
