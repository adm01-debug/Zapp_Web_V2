/**
 * CV-068, CV-069 — testes do hook useSmartTemplates.
 *
 * Verifica:
 *  - Templates são ranqueados por score (CV-068)
 *  - Variáveis conhecidas são preenchidas (CV-069)
 *  - Variáveis desconhecidas ficam como [[chave]] (CV-069)
 *  - Retorna no máximo topN templates
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSmartTemplates } from '../useSmartTemplates';
import type { QuickReplyTemplate } from '@/hooks/chat/useQuickReplies';

function makeTemplate(id: string, title: string, content: string, useCount = 0): QuickReplyTemplate {
  return {
    id, title, content,
    shortcut: null,
    category: 'Vendas',
    is_global: true,
    use_count: useCount,
    user_id: 'u1',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
}

describe('useSmartTemplates', () => {
  const templates = [
    makeTemplate('t1', 'Orçamento', 'Segue a proposta para {{nome}} no valor de R$ 100,00.', 10),
    makeTemplate('t2', 'Saudação', 'Olá {{nome}}, como posso ajudar?', 5),
    makeTemplate('t3', 'Fechamento', 'Vamos confirmar o pedido de {{produto}}?', 3),
  ];

  it('preenche variáveis conhecidas (nome do contato)', () => {
    const { result } = renderHook(() =>
      useSmartTemplates({
        templates,
        saleContext: { contactName: 'João Silva', agentName: 'Maria' },
      }),
    );

    const orçamento = result.current.find((r) => r.template.id === 't1');
    expect(orçamento?.filledContent).toContain('João Silva');
    expect(orçamento?.pendingVars).toHaveLength(0);
  });

  it('marca variáveis desconhecidas como [[produto]]', () => {
    const { result } = renderHook(() =>
      useSmartTemplates({
        templates: [makeTemplate('t3', 'Fechamento', 'Vamos confirmar o pedido de {{produto}}?')],
        saleContext: { contactName: 'Ana' },
      }),
    );

    expect(result.current[0].filledContent).toContain('[[produto]]');
    expect(result.current[0].pendingVars).toContain('produto');
  });

  it('preenche {{produto}} quando productMentioned está no contexto', () => {
    const { result } = renderHook(() =>
      useSmartTemplates({
        templates: [makeTemplate('t3', 'Fechamento', 'Pedido de {{produto}}.')],
        saleContext: { productMentioned: 'Caneta Personalizada' },
      }),
    );

    expect(result.current[0].filledContent).toContain('Caneta Personalizada');
    expect(result.current[0].pendingVars).toHaveLength(0);
  });

  it('limita ao topN', () => {
    const { result } = renderHook(() =>
      useSmartTemplates({ templates, saleContext: {}, topN: 2 }),
    );
    expect(result.current.length).toBeLessThanOrEqual(2);
  });

  it('ranqueia por score + use_count', () => {
    const { result } = renderHook(() =>
      useSmartTemplates({
        templates,
        saleContext: {
          salesStage: 'proposta',
          lastClientMessage: 'qual é a proposta?',
        },
      }),
    );
    // Template de Orçamento deve aparecer entre os primeiros por causa das keywords de proposta
    const ids = result.current.map((r) => r.template.id);
    expect(ids.indexOf('t1')).toBeLessThan(ids.indexOf('t2'));
  });

  it('retorna array vazio se não há templates', () => {
    const { result } = renderHook(() =>
      useSmartTemplates({ templates: [], saleContext: {} }),
    );
    expect(result.current).toHaveLength(0);
  });
});
