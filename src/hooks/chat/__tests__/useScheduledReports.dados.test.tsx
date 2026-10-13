import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * AH — camada de dados do `useScheduledReports` (`saveReport`/`deleteReport`/
 * `setReportActive`): grava em `scheduled_reports` e PROPAGA o erro (sem toast),
 * para o widget do Dashboard decidir o aviso. O stub registra as operações.
 */

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  erroLeitura: null as { message: string } | null,
  erroEscrita: null as { message: string } | null,
  ops: [] as Array<{ tipo: string; tabela: string; payload?: unknown; eq?: { col: string; val: unknown } }>,
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  type Construtor = {
    select: () => Construtor;
    order: (col: string, opts?: unknown) => Construtor;
    insert: (payload: unknown) => Promise<unknown>;
    update: (payload: unknown) => { eq: (col: string, val: unknown) => Promise<unknown>; then: (r: (v: unknown) => unknown) => unknown };
    delete: () => { eq: (col: string, val: unknown) => Promise<unknown> };
    then: (resolve: (v: unknown) => unknown) => unknown;
  };

  const escrita = () => Promise.resolve({ data: null, error: h.erroEscrita });

  const builder = (tabela: string): Construtor => {
    const b: Construtor = {
      select: () => b,
      order: () => b,
      insert: (payload: unknown) => { h.ops.push({ tipo: 'insert', payload, tabela }); return escrita(); },
      update: (payload: unknown) => {
        const op: { tipo: string; tabela: string; payload: unknown; eq?: { col: string; val: unknown } } = { tipo: 'update', tabela, payload };
        h.ops.push(op);
        return {
          eq: (col: string, val: unknown) => { op.eq = { col, val }; return escrita(); },
          then: (resolve: (v: unknown) => unknown) => escrita().then(resolve),
        };
      },
      delete: () => {
        const op: { tipo: string; tabela: string; eq?: { col: string; val: unknown } } = { tipo: 'delete', tabela };
        h.ops.push(op);
        return { eq: (col: string, val: unknown) => { op.eq = { col, val }; return escrita(); } };
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: h.rows, error: h.erroLeitura }).then(resolve),
    };
    return b;
  };

  return { supabase: { from: (tabela: string) => builder(tabela) } };
});

import { toast } from 'sonner';
import { useScheduledReports } from '@/hooks/chat/useScheduledReports';

const toastError = toast.error as ReturnType<typeof vi.fn>;
const ultima = (tipo: string) => [...h.ops].reverse().find((o) => o.tipo === tipo);

beforeEach(() => {
  h.rows = [];
  h.erroLeitura = null;
  h.erroEscrita = null;
  h.ops = [];
  vi.clearAllMocks();
});

describe('useScheduledReports — camada de dados', () => {
  it('saveReport sem id insere em `scheduled_reports` com os padrões', async () => {
    const { result } = renderHook(() => useScheduledReports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.saveReport({ name: '  Semanal  ', recipients: ['a@b.com'] });

    const insert = ultima('insert')!;
    expect(insert.tabela).toBe('scheduled_reports');
    expect(insert.payload).toMatchObject({
      name: 'Semanal',
      report_type: 'dashboard_summary',
      frequency: 'weekly',
      recipients: ['a@b.com'],
      format: 'pdf',
      is_active: true,
      created_by: 'user-1',
    });
    expect(typeof (insert.payload as { next_send_at: string }).next_send_at).toBe('string');
  });

  it('saveReport com id atualiza a linha pedida', async () => {
    const { result } = renderHook(() => useScheduledReports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.saveReport({ id: 'rel-1', name: 'Editado', recipients: ['a@b.com'] });

    const update = ultima('update')!;
    expect(update.tabela).toBe('scheduled_reports');
    expect(update.eq).toEqual({ col: 'id', val: 'rel-1' });
    expect(update.payload).toMatchObject({ name: 'Editado' });
  });

  it('saveReport propaga o erro sem avisar na tela', async () => {
    h.erroEscrita = { message: 'rls negou' };
    const { result } = renderHook(() => useScheduledReports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.saveReport({ name: 'X', recipients: ['a@b.com'] })).rejects.toThrow('rls negou');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('deleteReport apaga a linha e propaga o erro', async () => {
    const { result } = renderHook(() => useScheduledReports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.deleteReport('rel-1');
    expect(ultima('delete')).toMatchObject({ tipo: 'delete', tabela: 'scheduled_reports', eq: { col: 'id', val: 'rel-1' } });

    h.erroEscrita = { message: 'sem permissão' };
    await expect(result.current.deleteReport('rel-2')).rejects.toThrow('sem permissão');
  });

  it('setReportActive grava `is_active` na linha pedida', async () => {
    const { result } = renderHook(() => useScheduledReports());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.setReportActive('rel-1', false);

    const update = ultima('update')!;
    expect(update.tabela).toBe('scheduled_reports');
    expect(update.payload).toEqual({ is_active: false });
    expect(update.eq).toEqual({ col: 'id', val: 'rel-1' });
  });
});
