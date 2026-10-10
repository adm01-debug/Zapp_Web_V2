import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const f = vi.hoisted(() => ({
  testTemplate: vi.fn(),
  fetchVariants: vi.fn(),
}));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    testTemplate: f.testTemplate,
    fetchVariants: f.fetchVariants,
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'p-hugo', phone: '5541999001234' } }),
}));

import { TalkXTemplateTestDialog } from '../TalkXTemplateTestDialog';

const template = {
  id: 'tpl-A',
  name: 'Promoção do mês',
  content: 'Conteúdo salvo do template',
  description: null,
  category: 'geral',
  status: 'approved' as const,
  media_url: null,
  media_type: null,
  tags: [],
  custom_variables: [],
  use_count: 10,
  created_by: 'p-hugo',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  f.testTemplate.mockResolvedValue({ success: true });
  f.fetchVariants.mockResolvedValue([]);
});

/**
 * TL-122 refazer 2 — o editor SEMPRE passa `contentOverride` (`eContent`).
 * Portanto a janela decide o override pela PRESENÇA da prop, não pelo texto ter
 * caracteres: editor vazio testa VAZIO e não cai no conteúdo salvo do template.
 */
describe('TL-122 — editor vazio testa vazio, não o template salvo', () => {
  it('contentOverride="" recusa com "Template vazio", não envia e não busca variações', async () => {
    render(<TalkXTemplateTestDialog template={template as never} open onClose={vi.fn()} contentOverride="" />);

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    expect(await screen.findByText('Template vazio')).toBeTruthy();
    expect(f.testTemplate).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(f.fetchVariants).not.toHaveBeenCalled();
  });

  it('contentOverride só com espaços também recusa vazio, sem enviar nem buscar variantes', async () => {
    render(<TalkXTemplateTestDialog template={template as never} open onClose={vi.fn()} contentOverride="   " />);

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    expect(await screen.findByText('Template vazio')).toBeTruthy();
    expect(f.testTemplate).not.toHaveBeenCalled();
    expect(f.fetchVariants).not.toHaveBeenCalled();
  });

  it('contentOverride="texto na tela" envia o texto da tela, não o salvo', async () => {
    render(<TalkXTemplateTestDialog template={template as never} open onClose={vi.fn()} contentOverride="texto na tela" />);

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => expect(f.testTemplate).toHaveBeenCalledTimes(1));
    expect(f.testTemplate.mock.calls[0][0]).toMatchObject({ templateContent: 'texto na tela' });
  });

  it('sem a prop contentOverride, usa o conteúdo salvo do template', async () => {
    render(<TalkXTemplateTestDialog template={template as never} open onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => expect(f.testTemplate).toHaveBeenCalledTimes(1));
    expect(f.testTemplate.mock.calls[0][0]).toMatchObject({ templateContent: 'Conteúdo salvo do template' });
  });
});
