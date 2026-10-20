import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  createAiRequestId,
  buildPeriodKey,
  isAiRequestCurrent,
  useAiRequestGeneration,
  type AiRequestIdentity,
} from '../context';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('IA-048 — identidade de requisição de IA', () => {
  it('createAiRequestId gera um uuid v4 único por chamada', () => {
    const ids = Array.from({ length: 200 }, () => createAiRequestId());
    expect(new Set(ids).size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('buildPeriodKey usa o rótulo do período relativo escolhido', () => {
    expect(buildPeriodKey('7d')).toBe('7d');
    expect(buildPeriodKey('30d')).toBe('30d');
    expect(buildPeriodKey('all')).toBe('all');
  });

  it('buildPeriodKey deriva custom das datas escolhidas e muda quando a data muda', () => {
    const from = new Date(2026, 0, 5);
    const to = new Date(2026, 0, 10);
    expect(buildPeriodKey('custom', from, to)).toBe('custom:2026-01-05:2026-01-10');
    expect(buildPeriodKey('custom', from, null)).toBe('custom:2026-01-05:');
    expect(buildPeriodKey('custom', from, to))
      .not.toBe(buildPeriodKey('custom', from, new Date(2026, 0, 11)));
  });

  it('isAiRequestCurrent aceita a resposta quando nada do contexto explícito mudou', () => {
    const request: AiRequestIdentity = { requestId: 'r1', generation: 3, contactId: 'A', periodKey: '7d' };
    expect(isAiRequestCurrent(request, { generation: 3, contactId: 'A', periodKey: '7d' })).toBe(true);
  });

  it('isAiRequestCurrent descarta ao mudar geração, contato OU período', () => {
    const request: AiRequestIdentity = { requestId: 'r1', generation: 3, contactId: 'A', periodKey: '7d' };
    expect(isAiRequestCurrent(request, { generation: 4, contactId: 'A', periodKey: '7d' })).toBe(false);
    expect(isAiRequestCurrent(request, { generation: 3, contactId: 'B', periodKey: '7d' })).toBe(false);
    expect(isAiRequestCurrent(request, { generation: 3, contactId: 'A', periodKey: '30d' })).toBe(false);
  });
});

describe('useAiRequestGeneration', () => {
  it('begin devolve identidade única e isCurrent só vale para o contexto do clique', () => {
    const { result } = renderHook(() => useAiRequestGeneration({ contactId: 'A', periodKey: '7d' }));

    const first = result.current.begin();
    const second = result.current.begin();

    expect(first.requestId).toMatch(UUID_V4);
    expect(first.requestId).not.toBe(second.requestId);
    expect(second.generation).toBe(first.generation + 1);
    // A segunda requisição do mesmo contexto supera a primeira.
    expect(result.current.isCurrent(first)).toBe(false);
    expect(result.current.isCurrent(second)).toBe(true);
  });

  it('descarta a requisição em voo ao trocar de contato', () => {
    const { result, rerender } = renderHook(
      ({ contactId }: { contactId: string }) => useAiRequestGeneration({ contactId, periodKey: '7d' }),
      { initialProps: { contactId: 'A' } },
    );

    const request = result.current.begin();
    expect(result.current.isCurrent(request)).toBe(true);

    rerender({ contactId: 'B' });
    expect(result.current.isCurrent(request)).toBe(false);
  });

  it('descarta a requisição em voo ao trocar de período', () => {
    const { result, rerender } = renderHook(
      ({ periodKey }: { periodKey: string }) => useAiRequestGeneration({ contactId: 'A', periodKey }),
      { initialProps: { periodKey: '7d' } },
    );

    const request = result.current.begin();
    rerender({ periodKey: '30d' });
    expect(result.current.isCurrent(request)).toBe(false);
  });

  it('NÃO descarta quando só chegam mensagens vivas (contexto explícito intacto)', () => {
    // Mensagens não fazem parte do contexto; re-renderizar o mesmo contexto não
    // pode invalidar uma análise em voo — senão ela nunca apareceria.
    const { result, rerender } = renderHook(
      ({ tick }: { tick: number }) => {
        void tick;
        return useAiRequestGeneration({ contactId: 'A', periodKey: '7d' });
      },
      { initialProps: { tick: 0 } },
    );

    const request = result.current.begin();
    rerender({ tick: 1 });
    expect(result.current.isCurrent(request)).toBe(true);
  });

  it('invalidate derruba a requisição em voo mesmo sem trocar contato/período', () => {
    const { result } = renderHook(() => useAiRequestGeneration({ contactId: 'A', periodKey: '7d' }));

    const request = result.current.begin();
    act(() => { result.current.invalidate(); });
    expect(result.current.isCurrent(request)).toBe(false);
  });

  it('snapshot não incrementa a geração (reescrita não supera a análise vigente)', () => {
    const { result } = renderHook(() => useAiRequestGeneration({ contactId: 'A', periodKey: '7d' }));

    const request = result.current.begin();
    const shot = result.current.snapshot();

    expect(shot.generation).toBe(request.generation);
    expect(result.current.isCurrent(request)).toBe(true);
    expect(result.current.isCurrent(shot)).toBe(true);
  });
});
