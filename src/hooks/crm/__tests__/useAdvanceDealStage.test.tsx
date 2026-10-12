import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// Alerta de erro: precisa ser observável (o INSERT pode falhar por política e o usuário tem de saber).
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

const logError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  log: { error: (...a: unknown[]) => logError(...a), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const profileRef = vi.hoisted(() => ({ current: { id: 'profile-1' } as { id: string } | null }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: profileRef.current }) }));

const updateErrorRef = vi.hoisted(() => ({ current: null as unknown }));
const insertErrorRef = vi.hoisted(() => ({ current: null as unknown }));
const eqMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() =>
  vi.fn((table: string) => {
    if (table === 'sales_deals') return { update: updateMock };
    if (table === 'deal_activities') return { insert: insertMock };
    throw new Error(`tabela inesperada: ${table}`);
  }),
);
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (...a: unknown[]) => fromMock(...(a as [string])) },
}));

import { useAdvanceDealStage, nextActiveStage, type Crm360Stage } from '@/hooks/crm/useContactCrm360';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

function renderAdvance() {
  return renderHook(() => useAdvanceDealStage('contact-1'), { wrapper });
}

const stage = (id: string, name: string, position: number, is_active = true): Crm360Stage => ({
  id, name, position, is_active,
});

describe('nextActiveStage', () => {
  it('pula estágio inativo e devolve o próximo ativo por posição', () => {
    const stages = [stage('s1', 'Lead', 1), stage('s2', 'Proposta', 2, false), stage('s3', 'Negociação', 3)];
    expect(nextActiveStage(stages, 's1')?.id).toBe('s3');
  });

  it('devolve null quando não há etapa ativa depois da atual', () => {
    const stages = [stage('s1', 'Lead', 1), stage('s2', 'Fechamento', 2)];
    expect(nextActiveStage(stages, 's2')).toBeNull();
    expect(nextActiveStage(stages, null)).toBeNull();
    expect(nextActiveStage(stages, 'inexistente')).toBeNull();
  });

  it('ordena por posição (não pela ordem do array) e desempata por id', () => {
    const stages = [stage('b', 'B', 2), stage('a', 'A', 1), stage('c', 'C', 3)];
    expect(nextActiveStage(stages, 'a')?.id).toBe('b');
  });
});

describe('useAdvanceDealStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileRef.current = { id: 'profile-1' };
    updateErrorRef.current = null;
    insertErrorRef.current = null;
    updateMock.mockImplementation(() => ({ eq: eqMock }));
    eqMock.mockImplementation(() => Promise.resolve({ error: updateErrorRef.current }));
    insertMock.mockImplementation(() => Promise.resolve({ error: insertErrorRef.current }));
  });

  it('grava performed_by = perfil do usuário logado na atividade', async () => {
    const { result } = renderAdvance();
    await result.current.mutateAsync({
      dealId: 'd1', nextStageId: 's2', nextStageName: 'Proposta enviada', currentStageId: 's1',
    });

    expect(updateMock).toHaveBeenCalledWith({ stage_id: 's2' });
    expect(eqMock).toHaveBeenCalledWith('id', 'd1');
    expect(insertMock).toHaveBeenCalledWith({
      deal_id: 'd1',
      activity_type: 'stage_change',
      description: 'Movido para Proposta enviada',
      performed_by: 'profile-1',
    });
  });

  it('rejeita e alerta quando o INSERT da atividade falha (INSERT falho deixa de passar em silêncio)', async () => {
    insertErrorRef.current = { message: 'new row violates row-level security policy' };
    const { result } = renderAdvance();

    await expect(result.current.mutateAsync({
      dealId: 'd1', nextStageId: 's2', nextStageName: 'Proposta', currentStageId: 's1',
    })).rejects.toBeTruthy();

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledTimes(1);
    // o payload do log não carrega PII: só a mensagem fixa do evento
    expect(String(logError.mock.calls[0]?.[0])).toContain('useAdvanceDealStage');
  });

  it('não dispara UPDATE nem INSERT quando a etapa de destino já é a atual', async () => {
    const { result } = renderAdvance();
    await result.current.mutateAsync({
      dealId: 'd1', nextStageId: 's1', nextStageName: 'Lead', currentStageId: 's1',
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('sem perfil logado não escreve nada e alerta', async () => {
    profileRef.current = null;
    const { result } = renderAdvance();

    await expect(result.current.mutateAsync({
      dealId: 'd1', nextStageId: 's2', nextStageName: 'Proposta', currentStageId: 's1',
    })).rejects.toBeTruthy();

    expect(updateMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
