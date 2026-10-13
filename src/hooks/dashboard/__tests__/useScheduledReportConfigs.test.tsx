import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * AH — Relatórios Agendados do Dashboard.
 *
 * O widget precisa ler/gravar a MESMA tabela que a Edge `send-scheduled-report`
 * usa (`scheduled_reports`) e expor `last_sent_at`. O stub registra CADA tabela
 * tocada, então o teste falha se qualquer caminho voltar a `scheduled_report_configs`.
 */

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  erroLeitura: null as { message: string } | null,
  erroEscrita: null as { message: string } | null,
  ops: [] as Array<{ tipo: string; tabela: string; payload?: unknown; eq?: { col: string; val: unknown } }>,
  tabelas: [] as string[],
}));

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  type Cadeia = {
    eq: (col: string, val: unknown) => Promise<unknown>;
    then?: (resolve: (v: unknown) => unknown) => unknown;
  };
  type Construtor = {
    select: () => Construtor;
    order: (col: string, opts?: unknown) => Construtor;
    insert: (payload: unknown) => Promise<unknown>;
    update: (payload: unknown) => Cadeia;
    delete: () => Cadeia;
    then: (resolve: (v: unknown) => unknown) => unknown;
  };

  const escrita = () => Promise.resolve({ data: null, error: h.erroEscrita });

  const builder = (tabela: string) => {
    const b: Construtor = {
      select: () => b,
      order: () => { h.tabelas.push(tabela); return b; },
      insert: (payload: unknown) => { h.tabelas.push(tabela); h.ops.push({ tipo: 'insert', payload, tabela }); return escrita(); },
      update: (payload: unknown) => {
        const op: { tipo: string; tabela: string; payload: unknown; eq?: { col: string; val: unknown } } = { tipo: 'update', tabela, payload };
        h.tabelas.push(tabela);
        h.ops.push(op);
        return {
          eq: (col: string, val: unknown) => { op.eq = { col, val }; return escrita(); },
          then: (resolve: (v: unknown) => unknown) => escrita().then(resolve),
        };
      },
      delete: () => {
        const op: { tipo: string; tabela: string; eq?: { col: string; val: unknown } } = { tipo: 'delete', tabela };
        h.tabelas.push(tabela);
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
import { useScheduledReportConfigs } from '@/hooks/dashboard/useScheduledReportConfigs';
import { describeLastSend } from '@/hooks/chat/useScheduledReports';

const toastSuccess = toast.success as ReturnType<typeof vi.fn>;
const toastError = toast.error as ReturnType<typeof vi.fn>;

let qc: QueryClient | null = null;
function wrapper({ children }: { children: ReactNode }) {
  if (!qc) qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const RELATORIO = {
  id: 'rel-1',
  name: 'Resumo semanal',
  report_type: 'dashboard_summary',
  frequency: 'weekly',
  recipients: ['chefe@empresa.com'],
  format: 'pdf',
  is_active: true,
  last_sent_at: '2026-10-10T12:00:00.000Z',
  next_send_at: '2026-10-13T11:00:00.000Z',
  created_by: 'user-1',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

const ler = () => h.ops.filter((o) => o.tipo !== 'select');
const ultima = (tipo: string) => [...h.ops].reverse().find((o) => o.tipo === tipo);

beforeEach(() => {
  h.rows = [];
  h.erroLeitura = null;
  h.erroEscrita = null;
  h.ops = [];
  h.tabelas = [];
  qc = null;
  vi.clearAllMocks();
});

describe('useScheduledReportConfigs — mesma tabela da Edge', () => {
  it('lê `scheduled_reports` e expõe `last_sent_at`', async () => {
    h.rows = [RELATORIO];
    const { result } = renderHook(() => useScheduledReportConfigs(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.configs).toHaveLength(1);
    expect(result.current.configs[0].last_sent_at).toBe('2026-10-10T12:00:00.000Z');
    expect(h.tabelas).toContain('scheduled_reports');
    expect(h.tabelas).not.toContain('scheduled_report_configs');
  });

  it('criar grava em `scheduled_reports` com formato, próximo envio e criador', async () => {
    const { result } = renderHook(() => useScheduledReportConfigs(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.createConfig.mutate({
        name: 'Semanal',
        report_type: 'dashboard_summary',
        frequency: 'weekly',
        recipients: ['a@b.com'],
      });
    });
    await waitFor(() => expect(ultima('insert')).toBeTruthy());

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
    expect(typeof (insert.payload as { next_send_at?: string }).next_send_at).toBe('string');
    expect(toastSuccess).toHaveBeenCalledWith('Relatório criado com sucesso');
    expect(h.tabelas).not.toContain('scheduled_report_configs');
  });

  it('ativar/desativar grava só `is_active` invertido na linha pedida', async () => {
    const { result } = renderHook(() => useScheduledReportConfigs(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.toggleActive.mutate({ id: 'rel-1', isActive: true });
    });
    await waitFor(() => expect(ultima('update')).toBeTruthy());

    const update = ultima('update')!;
    expect(update.tabela).toBe('scheduled_reports');
    expect(update.payload).toEqual({ is_active: false });
    expect(update.eq).toEqual({ col: 'id', val: 'rel-1' });
  });

  it('remover apaga a linha pedida de `scheduled_reports`', async () => {
    const { result } = renderHook(() => useScheduledReportConfigs(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.deleteConfig.mutate('rel-1');
    });
    await waitFor(() => expect(ultima('delete')).toBeTruthy());

    const del = ultima('delete')!;
    expect(del.tabela).toBe('scheduled_reports');
    expect(del.eq).toEqual({ col: 'id', val: 'rel-1' });
    expect(toastSuccess).toHaveBeenCalledWith('Relatório removido');
  });

  it('erro da gravação chega ao usuário com a mensagem da origem', async () => {
    h.erroEscrita = { message: 'rls negou' };
    const { result } = renderHook(() => useScheduledReportConfigs(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.createConfig.mutate({
        name: 'Semanal', report_type: 'dashboard_summary', frequency: 'weekly', recipients: ['a@b.com'],
      });
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('rls negou'));
  });
});

describe('describeLastSend — resultado do último envio', () => {
  it('sem `last_sent_at` diz que nunca foi enviado', () => {
    expect(describeLastSend({ last_sent_at: null })).toEqual({ status: 'never', label: 'Nunca enviado', at: null });
  });

  it('com `last_sent_at` diz que houve envio e devolve o instante', () => {
    expect(describeLastSend({ last_sent_at: '2026-10-10T12:00:00.000Z' })).toEqual({
      status: 'sent', label: 'Enviado', at: '2026-10-10T12:00:00.000Z',
    });
  });
});
