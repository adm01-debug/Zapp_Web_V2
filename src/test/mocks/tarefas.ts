/**
 * Harness compartilhado dos testes do domínio de Tarefas.
 *
 * Os dois arquivos de teste (o hook `useMyWorkItems` e o `TasksModule`) precisam
 * exatamente do mesmo mock do cliente Supabase. Ficando em um lugar só, não há
 * duplicação de código novo (o gate do SonarCloud limita a 3% no código novo).
 *
 * O builder encadeável reaproveita `createQueryBuilder` de `./supabase` em vez de
 * reimplementá-lo: um builder para leitura (`select`) e outro para escrita
 * (`insert`/`update`/`upsert`), o que permite testar rollback de mutation.
 *
 * IMPORTANTE: importe este módulo ANTES do módulo sob teste. Os `vi.mock` abaixo
 * são registrados no momento do import.
 */
import { vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createQueryBuilder } from './supabase';

/** Espiões compartilhados: substituem o Supabase/sonner/undoToast/useAuth.
 *
 *  Não usa `vi.hoisted`: este módulo é avaliado antes do módulo sob teste (o
 *  import vem primeiro no arquivo de teste), então os `vi.mock` abaixo já
 *  encontram os espiões prontos quando o Vitest chama os factories. */
export const supabaseMock = {
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  undoToast: vi.fn(),
  auth: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
};

vi.mock('sonner', () => ({ toast: supabaseMock.toast }));
vi.mock('@/lib/undoToast', () => ({ undoToast: supabaseMock.undoToast }));
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => supabaseMock.auth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => supabaseMock.from(table),
    channel: (name: string) => supabaseMock.channel(name),
    removeChannel: (ch: unknown) => supabaseMock.removeChannel(ch),
  },
}));

/** O que o cliente falso devolve numa consulta. */
export type MockResult = { data?: unknown; error?: unknown };

let selectResult: MockResult = { data: [], error: null };
let writeResult: MockResult = { error: null };

/** O que a próxima leitura (`select`) devolve. */
export function setSelectResult(result: MockResult) { selectResult = result; }
/** O que a próxima escrita (`insert`/`update`/`upsert`) devolve. */
export function setWriteResult(result: MockResult) { writeResult = result; }

/** Zera os espiões e reinstala o cliente falso. Chamar em `beforeEach`. */
export function resetSupabaseMock() {
  vi.clearAllMocks();
  selectResult = { data: [], error: null };
  writeResult = { error: null };
  supabaseMock.auth.mockReturnValue({ profile: { id: 'u1' } });
  supabaseMock.channel.mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  });
  supabaseMock.from.mockImplementation(() => {
    const leitura = createQueryBuilder(selectResult.data ?? null, selectResult.error ?? null);
    const escrita = createQueryBuilder(null, writeResult.error ?? null);
    return {
      select: (cols: string) => { supabaseMock.select(cols); return leitura; },
      insert: (row: unknown) => { supabaseMock.insert(row); return escrita; },
      update: (patch: unknown) => { supabaseMock.update(patch); return escrita; },
      upsert: (rows: unknown, opts: unknown) => {
        supabaseMock.upsert(rows, opts);
        return escrita;
      },
    };
  });
}

/** `QueryClient` de teste (sem retry, sem cache entre casos). */
export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

/** Wrapper de `renderHook` com o `QueryClientProvider`. */
export function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

/** Linha de `conversation_tasks` como o banco devolve (contato embutido incluso). */
export function makeTaskRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 't1',
    title: 'Ligar para o cliente',
    description: null,
    status: 'todo',
    priority: 'medium',
    due_date: null,
    remind_at: null,
    notified_at: null,
    waiting_reason: null,
    position: 0,
    started_at: null,
    status_changed_at: '2026-09-29T10:00:00.000Z',
    completed_at: null,
    contact_id: null,
    created_by: 'u1',
    assigned_to: 'u1',
    created_at: '2026-09-29T10:00:00.000Z',
    updated_at: '2026-09-29T10:00:00.000Z',
    contact: null,
    ...over,
  };
}
