import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

/**
 * X094 — "Cabeçalho do editor dentro do shell … e campos".
 *
 * Defeitos cobertos aqui (a lacuna que o item nomeia):
 *  1. a descrição do template existia no estado, ia no payload do save e entrava no
 *     dirty-check, mas NÃO tinha campo: não havia como escrever a descrição em lugar
 *     nenhum do editor (`EDT:33,91` do plano);
 *  2. o editor era uma tela interna sem trilha — o cabeçalho do módulo não dizia onde
 *     a pessoa estava.
 *
 * Renderiza o TalkXTemplateEditor REAL; só o hook de dados é mockado.
 */

const mocks = vi.hoisted(() => ({
  updateMutateAsync: vi.fn(),
  templates: [
    {
      id: 'tpl_1', name: 'Promoção do mês', description: 'Oferta de outubro', category: 'geral',
      content: 'Promoção do mês: 20% off', media_url: null, media_type: null, tags: [] as string[],
      status: 'approved' as const, use_count: 10, created_by: null, custom_variables: [] as string[],
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
  ],
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: mocks.templates,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateTemplate: { mutate: vi.fn(), mutateAsync: mocks.updateMutateAsync },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn().mockResolvedValue([]),
    fetchVariants: vi.fn().mockResolvedValue([]),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

import { TalkXTemplateEditor } from '../TalkXTemplateEditor';

const renderEditor = () => render(
  <TalkXTemplateEditor
    templates={mocks.templates as never}
    isLoading={false}
    editing={mocks.templates[0] as never}
    onClose={vi.fn()}
  />,
);

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('X094 — campos do editor (descrição) e trilha dentro do shell', () => {
  it('mostra a descrição do template no campo de descrição', () => {
    renderEditor();

    const campo = screen.getByLabelText('Descrição');
    expect(campo).toHaveValue('Oferta de outubro');
  });

  it('descrição editada é o que o save manda para o banco', async () => {
    mocks.updateMutateAsync.mockResolvedValue(undefined);
    renderEditor();

    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Campanha de outubro' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar template/ }));

    await waitFor(() => expect(mocks.updateMutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.updateMutateAsync.mock.calls[0][0]).toMatchObject({
      id: 'tpl_1',
      description: 'Campanha de outubro',
    });
  });

  it('o editor traz a trilha da tela 05 dentro do shell do módulo', () => {
    renderEditor();

    const trilha = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(trilha).toHaveTextContent('Talk X');
    expect(trilha).toHaveTextContent('Campanhas');
    expect(trilha).toHaveTextContent('Templates');
  });
});
