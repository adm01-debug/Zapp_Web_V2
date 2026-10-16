import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

/**
 * X193 (TL-176) — comportamento em telas menores.
 *
 * Defeito: o painel direito do editor de template (pré-visualização, variações
 * A/B, histórico de versões e desempenho) era `hidden xl:flex` — só aparecia a
 * partir de 1280 px. Abaixo disso (o notebook de 1024 px e o celular de 390 px)
 * o painel ficava sem caminho: a única reserva era a faixa de variações A/B, e
 * nada abria a prévia nem o "Ver versões" — o histórico de versões ficava
 * inacessível.
 *
 * Contrato provado aqui:
 *   1. Abaixo de 1280 px existe a gaveta do cabeçalho, e ela entrega o painel
 *      inteiro: prévia, variações A/B e histórico com as versões carregadas.
 *   2. Em 1280 px não há botão de gaveta: o painel segue inline, com o
 *      "Ver versões" no lugar de sempre.
 */

const fetchVariants = vi.fn();
const fetchVersionHistory = vi.fn();
const saveVariant = vi.fn();
const deleteVariant = vi.fn();
const countVariantRecipients = vi.fn();

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: [],
    isLoading: false,
    createTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    duplicateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory,
    fetchVariants,
    saveVariant,
    deleteVariant,
    countVariantRecipients,
  }),
}));

vi.mock('@/hooks/integrations/useTalkXTemplateStats', () => ({
  useTalkXTemplateLibraryStats: () => ({ stats: null }),
  useTalkXTemplateStats: () => ({ stats: null }),
  pointsDelta: () => null,
  TALKX_TEMPLATE_STATS_PERIODS: [7, 30, 90],
  TALKX_STATS_MIN_BASE: 30,
}));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ campaigns: [] }),
}));

import { TalkXTemplateEditor } from '../TalkXTemplateEditor';

type TalkXTemplate = {
  id: string; name: string; description: string | null; category: string; content: string;
  media_url: string | null; media_type: string | null; tags: string[]; status: 'draft' | 'review' | 'approved';
  use_count: number; created_by: string | null; custom_variables: string[]; created_at: string; updated_at: string;
};

const template: TalkXTemplate = {
  id: 'tpl-A', name: 'Template A', description: null, category: 'geral', content: 'corpo do template A',
  media_url: null, media_type: null, tags: [], status: 'approved', use_count: 0, created_by: null,
  custom_variables: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

const version = (id: string, name: string) => ({
  id, template_id: 'tpl-A', version_number: 2, name, description: null, content: `corpo de ${name}`,
  category: 'geral', status: 'approved', media_url: null, media_type: null, tags: [], custom_variables: [],
  created_at: '2026-01-02T00:00:00Z',
});

/**
 * Mente a largura da janela: a consulta de `xl` (1280) é a única que responde
 * `matches`. O `setup` da suíte responde `false` para tudo, que é o caso das
 * telas menores (1024 e 390) — o mesmo caminho que o `hidden xl:flex` corta.
 */
function fingirLargura(larga: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: larga && query.includes('1280px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => { window.matchMedia = original; };
}

const GATILHO = /prévia e histórico/i;

function renderEditor() {
  return render(
    <TalkXTemplateEditor
      templates={[template as never]}
      isLoading={false}
      editing={template as never}
      onClose={vi.fn()}
    />,
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
  fetchVersionHistory.mockResolvedValue([version('ver-A', 'Versao A')]);
  fetchVariants.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe('X193 — painel do editor de template abaixo de 1280 px', () => {
  it('em 1024 px (e 390 px) a prévia, as variações e o histórico vêm pela gaveta do cabeçalho', async () => {
    const desfazer = fingirLargura(false);
    try {
      renderEditor();

      // Nada aberto por conta própria: o caminho abaixo de 1280 é o botão.
      expect(screen.queryByRole('dialog')).toBeNull();
      const gatilho = screen.getByRole('button', { name: GATILHO });
      fireEvent.click(gatilho);

      const gaveta = await screen.findByRole('dialog');
      // Pré-visualização: como a mensagem aparece no destino.
      expect(within(gaveta).getByText('Como aparece no WhatsApp')).toBeInTheDocument();
      // Variações A/B — a faixa antiga de reserva sai de cena junto com a gaveta.
      expect(within(gaveta).getByRole('button', { name: /variante/i })).toBeInTheDocument();
      // Histórico de versões: o ponto que era inacessível abaixo de xl.
      fireEvent.click(within(gaveta).getByRole('button', { name: 'Ver versões' }));
      expect(await within(gaveta).findByText(/Versao A/)).toBeInTheDocument();
      expect(fetchVersionHistory).toHaveBeenCalledWith('tpl-A');
    } finally {
      desfazer();
    }
  });

  it('em 1280 px o painel continua inline, sem botão de gaveta', () => {
    const desfazer = fingirLargura(true);
    try {
      renderEditor();

      expect(screen.queryByRole('button', { name: GATILHO })).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByRole('button', { name: 'Ver versões' })).toBeInTheDocument();
      expect(screen.getByText('Como aparece no WhatsApp')).toBeInTheDocument();
    } finally {
      desfazer();
    }
  });
});
