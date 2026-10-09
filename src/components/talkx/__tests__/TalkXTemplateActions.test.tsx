import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

/**
 * X090 — ações de template UNIFICADAS (menu ⋮, duplicar que abre a cópia,
 * testar, excluir pelo modal do kit) e aprovação por papel.
 *
 * Antes: o cartão tinha 3 botões soltos (Editar/Duplicar/Excluir) e nenhum
 * Testar; a exclusão abria um `AlertDialog` próprio da tela; o "Duplicar"
 * criava a cópia e NÃO abria nada (a pessoa não sabia qual da lista era a
 * cópia); o status era um `<Select>` livre, sem papel.
 *
 * Este teste renderiza o TalkXTemplates REAL e prova, pelo comportamento:
 *   1. Duplicar pelo menu cria a cópia E abre a cópia no editor;
 *   2. "Testar" só aparece para admin/supervisor (é o que o `talkx-send` aceita)
 *      e a janela mostra o recado do envio;
 *   3. Excluir passa pelo modal do kit e chama a exclusão do template certo;
 *   4. o `<Select>` livre de status saiu: no editor o status é o controle de
 *      aprovação (autor → "Enviar para revisão"; supervisor → "Aprovar").
 */

const f = vi.hoisted(() => {
  const base = {
    description: null, category: 'geral', media_url: null, media_type: null,
    tags: [] as string[], created_by: null, custom_variables: [] as string[],
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
  return {
    roles: { isAdmin: false, isSupervisor: false },
    duplicateAsync: vi.fn(),
    deleteAsync: vi.fn(),
    updateAsync: vi.fn(),
    testTemplate: vi.fn(),
    templates: [
      { ...base, id: 'tpl-A', name: 'Promoção do mês', content: 'Promoção do mês: 20% off', status: 'draft' as const, use_count: 10 },
      { ...base, id: 'tpl-B', name: 'Boas-vindas', content: 'Olá {{nome}}', status: 'approved' as const, use_count: 3 },
    ],
    copy: { ...base, id: 'tpl-A-copia', name: 'Promoção do mês (cópia)', content: 'Promoção do mês: 20% off', status: 'draft' as const, use_count: 0 },
  };
});

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: f.templates,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateTemplate: { mutate: vi.fn(), mutateAsync: f.updateAsync, isPending: false },
    deleteTemplate: { mutate: vi.fn(), mutateAsync: f.deleteAsync, isPending: false },
    duplicateTemplate: { mutate: vi.fn(), mutateAsync: f.duplicateAsync, isPending: false },
    testTemplate: f.testTemplate,
    fetchVersionHistory: vi.fn().mockResolvedValue([]),
    fetchVariants: vi.fn().mockResolvedValue([]),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    isAdmin: f.roles.isAdmin,
    isSupervisor: f.roles.isSupervisor,
    isSpecialAgent: false,
    roles: [],
  }),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'p-hugo', phone: '5541999001234' } }),
}));

import { TalkXTemplates } from '../TalkXTemplates';

/** O cartão e a biblioteca lateral repetem o gatilho: o do CARTÃO vem primeiro. */
const triggerDoCartao = (nome: string) =>
  screen.getAllByRole('button', { name: `Ações do template ${nome}` })[0];

const abrirMenu = (nome: string) =>
  fireEvent.keyDown(triggerDoCartao(nome), { key: 'ArrowDown' });

const clicarItem = (nome: string) =>
  fireEvent.click(screen.getByRole('menuitem', { name: nome }));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  f.roles.isAdmin = false;
  f.roles.isSupervisor = false;
  f.duplicateAsync.mockResolvedValue(f.copy);
  f.deleteAsync.mockResolvedValue(undefined);
  f.updateAsync.mockResolvedValue(undefined);
  f.testTemplate.mockResolvedValue({ success: true });
});

describe('X090 — ações de template unificadas', () => {
  it('Duplicar pelo menu cria a cópia E abre a cópia no editor', async () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    abrirMenu('Promoção do mês');
    clicarItem('Duplicar');

    await waitFor(() => expect(f.duplicateAsync).toHaveBeenCalledTimes(1));
    expect(f.duplicateAsync.mock.calls[0][0]).toMatchObject({ id: 'tpl-A' });

    // a cópia abre no editor (antes: só nascia na lista, sem abrir nada)
    await waitFor(() => expect(screen.getByText('Editar template')).toBeTruthy());
    expect(screen.getByDisplayValue('Promoção do mês (cópia)')).toBeTruthy();
  });

  it('agente não vê Testar; admin vê, e a janela mostra o recado do envio', async () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    abrirMenu('Promoção do mês');
    expect(screen.queryByRole('menuitem', { name: 'Testar' })).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });

    f.roles.isAdmin = true;
    cleanup();
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    abrirMenu('Promoção do mês');
    clicarItem('Testar');

    // número já preenchido com o `profiles.phone` de quem está logado
    await waitFor(() => expect(screen.getByDisplayValue('5541999001234')).toBeTruthy());

    f.testTemplate.mockRejectedValueOnce(new Error('Só admin ou supervisor pode enviar teste.'));
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => expect(f.testTemplate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Só admin ou supervisor pode enviar teste.')).toBeTruthy();
  });

  it('Excluir abre o modal do kit e exclui o template escolhido', async () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    abrirMenu('Promoção do mês');
    clicarItem('Excluir');

    expect(await screen.findByText('Excluir template?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(f.deleteAsync).toHaveBeenCalledWith('tpl-A'));
  });

  it('o editor não tem mais o Select livre de status; supervisor aprova pelo controle', async () => {
    f.roles.isSupervisor = true;
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    abrirMenu('Promoção do mês');
    clicarItem('Editar');

    // só o Select de CATEGORIA restou (o de status saiu)
    await waitFor(() => expect(screen.getByText('Editar template')).toBeTruthy());
    expect(screen.getAllByRole('combobox')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /^Aprovar$/ }));
    await waitFor(() => expect(f.updateAsync).toHaveBeenCalledTimes(1));
    expect(f.updateAsync.mock.calls[0][0]).toMatchObject({
      id: 'tpl-A', expectedUpdatedAt: '2026-01-01T00:00:00Z', status: 'approved',
    });
  });

  it('autor (sem papel) vê "Enviar para revisão" e não vê "Aprovar"', async () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    // Nome ANCORADO: o cartão tem `role="button"` e o nome acessível dele inclui
    // o texto dos filhos, então /Enviar para revisão/ também casaria com o cartão.
    expect(screen.getAllByRole('button', { name: /^Enviar para revisão$/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Aprovar$/ })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /^Enviar para revisão$/ })[0]);
    await waitFor(() => expect(f.updateAsync).toHaveBeenCalledTimes(1));
    expect(f.updateAsync.mock.calls[0][0]).toMatchObject({ id: 'tpl-A', status: 'review' });
  });
});
