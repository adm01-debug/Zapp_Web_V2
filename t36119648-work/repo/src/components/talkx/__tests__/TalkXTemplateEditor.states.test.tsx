import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X047 — matriz de estados, linha do EDITOR DE TEMPLATE (biblioteca lateral).
 *
 * A regra da etapa: consulta que falhou mostra o ERRO, nunca o vazio. A coluna
 * "Biblioteca" do editor decidia isso à mão
 * (`isLoading ? esqueleto : libFiltered.length === 0 ? "Nenhum template" : …`)
 * e não recebia o erro da consulta — com a consulta quebrada o editor dizia
 * "Nenhum template", ou seja, que a base estava vazia.
 *
 * Este teste fixa o contrato da tela: carregando -> erro -> vazio -> conteúdo,
 * exatamente como o `TalkXQueryBoundary` aplicado nas outras telas do módulo.
 */

const H = vi.hoisted(() => ({
  templates: [] as Array<Record<string, unknown>>,
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

// O editor consome os KPIs da biblioteca (react-query real, X091) e o widget
// "Em andamento" (campanhas): provider real + supabase/useTalkX mínimos.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ campaigns: [], isLoading: false, isError: false, error: null, isLive: false, refetchCampaigns: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: H.templates,
    isLoading: H.isLoading,
    isError: H.isError,
    error: H.error,
    refetch: H.refetch,
    createTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn(),
    fetchVariants: vi.fn(),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

import { TalkXTemplateEditor } from '../TalkXTemplateEditor';

const tpl = {
  id: 'tpl-1', name: 'Template Um', description: null, category: 'geral', content: 'corpo',
  media_url: null, media_type: null, tags: [], status: 'approved' as const, use_count: 0,
  created_by: null, custom_variables: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

const VAZIO = 'Nenhum template';

function renderEditor() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TalkXTemplateEditor
        templates={H.templates as never}
        isLoading={H.isLoading}
        editing={null}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  H.templates = [];
  H.isLoading = false;
  H.isError = false;
  H.error = null;
  H.refetch.mockClear();
});

describe('matriz de estados — TalkXTemplateEditor / biblioteca (X047)', () => {
  it('consulta com erro: mostra o erro, NUNCA o vazio da biblioteca', () => {
    H.isError = true;
    H.error = new Error('falha exclusiva X047 — editor de template');
    const { container } = renderEditor();

    expect(screen.getByText(/Não foi possível carregar/)).toBeTruthy();
    expect(screen.queryByText(VAZIO)).toBeNull();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
    expect(container.querySelector('[data-talkx-query="loading"]')).toBeNull();
  });

  it('erro: "Ver detalhes" revela a mensagem real da consulta', () => {
    H.isError = true;
    H.error = new Error('falha exclusiva X047 — editor de template');
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/i }));
    expect(screen.getByText(/falha exclusiva X047/)).toBeTruthy();
  });

  it('erro: "Tentar novamente" refaz a consulta que alimenta a biblioteca', () => {
    H.isError = true;
    H.error = new Error('falha exclusiva X047 — editor de template');
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(H.refetch).toHaveBeenCalledTimes(1);
  });

  it('carregando: esqueleto com aria-busy e sem anúncio de erro', () => {
    H.isLoading = true;
    const { container } = renderEditor();

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText(/Não foi possível carregar/)).toBeNull();
    expect(screen.queryByText(VAZIO)).toBeNull();
  });

  it('sem erro e biblioteca vazia de verdade: aí sim o vazio', () => {
    const { container } = renderEditor();

    expect(screen.getByText(VAZIO)).toBeTruthy();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeTruthy();
    expect(screen.queryByText(/Não foi possível carregar/)).toBeNull();
  });

  it('com templates: a biblioteca mostra a lista, não o vazio', () => {
    H.templates = [tpl];
    const { container } = renderEditor();

    expect(screen.getAllByText(tpl.name).length).toBeGreaterThan(0);
    expect(screen.queryByText(VAZIO)).toBeNull();
    expect(container.querySelector('[data-talkx-query="empty"]')).toBeNull();
  });
});
