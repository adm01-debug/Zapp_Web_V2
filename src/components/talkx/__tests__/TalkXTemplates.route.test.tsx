import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

/**
 * X094 — a tela 05 (editor de template) vive no endereço:
 * `?view=talkx&tab=templates&template=<id|new>&ttab=conteudo|ab|historico`.
 *
 * Contrato do defeito: `TalkXTemplates` trocava biblioteca ↔ editor só por estado
 * local (`ViewMode = 'list' | 'edit'`), então link direto, F5 e voltar/avançar do
 * navegador não tinham endereço — quem mandasse o link de um template caía na
 * biblioteca e quem recarregasse perdia o editor.
 *
 * Renderiza os componentes REAIS (TalkXTemplates e o TalkXTemplateEditor que ela
 * abre); só o hook de dados é mockado.
 */

const mocks = vi.hoisted(() => {
  const base = {
    description: null, category: 'geral', media_url: null, media_type: null,
    tags: [] as string[], status: 'approved' as const, created_by: null, custom_variables: [] as string[],
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
  return {
    toastError: vi.fn(),
    fetchVersionHistory: vi.fn().mockResolvedValue([]),
    fetchVariants: vi.fn().mockResolvedValue([]),
    updateMutateAsync: vi.fn(),
    createMutateAsync: vi.fn(),
    templates: [
      { ...base, id: 'tpl_1', name: 'Promoção do mês', content: 'Promoção do mês: 20% off', tags: ['promo'], use_count: 10 },
      { ...base, id: 'tpl_2', name: 'Boas-vindas', content: 'Olá {{nome}}', tags: ['boasvindas'], use_count: 3 },
    ],
  };
});

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, info: vi.fn(), success: vi.fn() } }));

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
    duplicateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: mocks.fetchVersionHistory,
    fetchVariants: mocks.fetchVariants,
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

import { TalkXTemplates } from '../TalkXTemplates';

const search = () => new URLSearchParams(window.location.search);

/** Biblioteca (nenhum template aberto) com o endereço da aba de templates. */
function abrirBiblioteca() {
  window.history.replaceState(null, '', '/?view=talkx&tab=templates');
}

/** Mesmo endereço com o editor aberto. */
function abrirEditorNoEndereco(templateId: string, ttab = 'conteudo') {
  window.history.replaceState(null, '', `/?view=talkx&tab=templates&template=${templateId}&ttab=${ttab}`);
}

const editorAberto = () => screen.queryByText('Salvar template') !== null;

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  abrirBiblioteca();
});

describe('TalkXTemplates — o editor de template vive no endereço (X094)', () => {
  it('link direto (e F5) abre o editor no template do endereço', async () => {
    abrirEditorNoEndereco('tpl_1');
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    await waitFor(() => expect(editorAberto()).toBe(true));
    expect(screen.getAllByDisplayValue('Promoção do mês').length).toBeGreaterThan(0);
    // O endereço canônico já traz o ttab explícito: nada a reescrever.
    expect(search().get('template')).toBe('tpl_1');
    expect(search().get('ttab')).toBe('conteudo');
  });

  it('endereço sem ttab é completado em Conteúdo, sem perder o template', async () => {
    window.history.replaceState(null, '', '/?view=talkx&tab=templates&template=tpl_2');
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    await waitFor(() => expect(editorAberto()).toBe(true));
    expect(screen.getAllByDisplayValue('Boas-vindas').length).toBeGreaterThan(0);
    await waitFor(() => expect(search().get('ttab')).toBe('conteudo'));
  });

  it('ttab=historico abre a sub-aba Histórico e busca as versões do template', async () => {
    abrirEditorNoEndereco('tpl_1', 'historico');
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    await waitFor(() => expect(mocks.fetchVersionHistory).toHaveBeenCalledWith('tpl_1'));
  });

  it('ttab=ab abre a sub-aba Variações A/B e busca as variantes do template', async () => {
    abrirEditorNoEndereco('tpl_1', 'ab');
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    await waitFor(() => expect(mocks.fetchVariants).toHaveBeenCalledWith('tpl_1'));
  });

  it('abrir pela biblioteca escreve o template no endereço', async () => {
    abrirBiblioteca();
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    fireEvent.click(screen.getAllByLabelText('Editar')[0]);

    await waitFor(() => expect(editorAberto()).toBe(true));
    expect(search().get('template')).toBe('tpl_1');
    expect(search().get('ttab')).toBe('conteudo');
    expect(search().get('tab')).toBe('templates');
  });

  it('trocar de template na biblioteca lateral do editor acompanha o endereço', async () => {
    abrirEditorNoEndereco('tpl_1', 'ab');
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);
    await waitFor(() => expect(editorAberto()).toBe(true));

    fireEvent.click(screen.getAllByText('Boas-vindas')[0].closest('button') as HTMLElement);

    // O endereço segue a troca feita dentro do editor, preservando a sub-aba aberta.
    await waitFor(() => expect(search().get('template')).toBe('tpl_2'));
    expect(search().get('ttab')).toBe('ab');
    expect(screen.getAllByDisplayValue('Boas-vindas').length).toBeGreaterThan(0);
  });

  it('criar template escreve template=new no endereço e abre o editor vazio', async () => {
    abrirBiblioteca();
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Novo Template/ }));

    await waitFor(() => expect(search().get('template')).toBe('new'));
    expect(editorAberto()).toBe(true);
    expect(screen.getByText('Novo template')).toBeInTheDocument();
  });

  it('voltar no navegador fecha o editor e limpa o endereço', async () => {
    abrirEditorNoEndereco('tpl_1');
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);
    await waitFor(() => expect(editorAberto()).toBe(true));

    await act(async () => {
      abrirBiblioteca();
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => expect(editorAberto()).toBe(false));
    expect(screen.getAllByText('Promoção do mês').length).toBeGreaterThan(0);
  });

  it('sair do editor pelo Voltar devolve a biblioteca e limpa o endereço', async () => {
    abrirEditorNoEndereco('tpl_1');
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);
    await waitFor(() => expect(editorAberto()).toBe(true));

    fireEvent.click(await screen.findByLabelText('Voltar'));

    await waitFor(() => expect(editorAberto()).toBe(false));
    expect(search().has('template')).toBe(false);
    expect(search().has('ttab')).toBe(false);
  });

  it('id que a consulta não devolve cai na biblioteca com o endereço limpo', async () => {
    abrirEditorNoEndereco('tpl_apagado');
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    await waitFor(() => expect(search().has('template')).toBe(false));
    expect(editorAberto()).toBe(false);
    expect(screen.getAllByText('Promoção do mês').length).toBeGreaterThan(0);
    expect(mocks.toastError).toHaveBeenCalledWith('Template não encontrado ou sem acesso.');
  });
});
