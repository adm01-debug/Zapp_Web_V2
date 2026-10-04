import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * X047b — matriz de estados, linha da tela Templates.
 *
 * A regra da etapa: consulta que falhou mostra o ERRO, nunca a tela vazia. Antes, a
 * tela tinha a corrente `isLoading ? esqueleto : templates.length === 0 ? vazio : …`
 * em dois lugares (grade e lista) e decidia isso à mão.
 *
 * Caso que este teste protege especificamente: existem DOIS vazios nesta tela — o real
 * (`templates.length === 0`, que é estado da consulta e foi para o boundary) e o
 * filtrado (`paged.length === 0`, que é consequência do filtro e continua dentro do
 * conteúdo). Confundir os dois faria a tela dizer "nenhum template encontrado" quando
 * na verdade a consulta falhou.
 */

const refetch = vi.fn();

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: [],
    isLoading: false,
    isError: true,
    error: new Error('falha exclusiva X047b'),
    refetch,
    createTemplate: { mutate: vi.fn() },
    updateTemplate: { mutate: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn(),
    fetchVariants: vi.fn(),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ campaigns: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));

import { TalkXTemplates } from '../TalkXTemplates';

describe('matriz de estados — TalkXTemplates (X047b)', () => {
  it('consulta com erro: mostra o erro e NÃO o vazio da consulta', () => {
    const { container } = render(<TalkXTemplates />);
    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
  });

  it('consulta com erro: não mostra nehum dos vazios da tela', () => {
    render(<TalkXTemplates />);
    expect(screen.queryByText('Nenhum template criado')).toBeNull();
    expect(screen.queryByText('Nenhum template encontrado')).toBeNull();
  });
});
