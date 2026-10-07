import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

/**
 * R2-MOD-061 (#427, P2) — "Atalho Duplicar template abre o editor do original".
 *
 * O atalho do rail "Duplicar template — Baseado em um existente" chamava
 * `openEdit(selected)`: abria o editor do ORIGINAL (id/updated_at dele) e salvar
 * disparava `updateTemplate` naquele id — a pessoa que queria uma variação mexia no
 * template em uso. Os botões "Duplicar" das linhas/cartões usam a mutation
 * `duplicateTemplate`; o atalho não usava.
 *
 * Aceite do achado (findings.json, R2-MOD-061):
 *   1. o atalho produz novo id e não altera o original;
 *   2. sem seleção, apresenta um fluxo novo, sem alegar duplicação.
 *
 * Renderiza o componente REAL (TalkXTemplates e o TalkXTemplateEditor que ela abre);
 * só o hook de dados é mockado, com espiões para ver qual mutação foi disparada.
 */

const mocks = vi.hoisted(() => {
  const base = {
    description: null, category: 'geral', media_url: null, media_type: null,
    tags: [] as string[], status: 'approved' as const, created_by: null, custom_variables: [] as string[],
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
  return {
    duplicateMutate: vi.fn(),
    updateMutateAsync: vi.fn(),
    createMutateAsync: vi.fn(),
    templates: [
      { ...base, id: 'tpl-A', name: 'Promoção do mês', content: 'Promoção do mês: 20% off', tags: ['promo'], use_count: 10 },
      { ...base, id: 'tpl-B', name: 'Boas-vindas', content: 'Olá {{nome}}', tags: ['boasvindas'], use_count: 3 },
    ],
  };
});

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: mocks.templates,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn(), mutateAsync: mocks.createMutateAsync },
    updateTemplate: { mutate: vi.fn(), mutateAsync: mocks.updateMutateAsync },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: mocks.duplicateMutate },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn().mockResolvedValue([]),
    fetchVariants: vi.fn().mockResolvedValue([]),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

import { TalkXTemplates } from '../TalkXTemplates';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Seleciona o template "Boas-vindas" (o SEGUNDO da lista) clicando no cartão. */
const selecionarBoasVindas = () =>
  fireEvent.click(screen.getByText('Olá {{nome}}').closest('[role="button"]') as HTMLElement);

/** Atalho "Duplicar template" do RailCard "Ações rápidas". */
const clicarNoAtalhoDuplicar = () =>
  fireEvent.click(screen.getByText('Duplicar template').closest('button') as HTMLElement);

describe('R2-MOD-061 — atalho Duplicar template (rail)', () => {
  it('com template selecionado: duplica O SELECIONADO e NÃO abre o editor do original', () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    selecionarBoasVindas();
    clicarNoAtalhoDuplicar();

    // antes da correção, o atalho abria o editor do ORIGINAL ("Editar template")
    expect(screen.queryByText('Editar template')).toBeNull();
    expect(mocks.duplicateMutate).toHaveBeenCalledTimes(1);
    expect(mocks.duplicateMutate.mock.calls[0][0]).toMatchObject({ id: 'tpl-B', name: 'Boas-vindas' });
    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
  });

  it('sem seleção: abre o fluxo de template novo, sem duplicar nada', () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    clicarNoAtalhoDuplicar();

    expect(screen.getByText('Novo template')).toBeTruthy();
    expect(screen.queryByText('Editar template')).toBeNull();
    expect(mocks.duplicateMutate).not.toHaveBeenCalled();
  });
});
