import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';

/**
 * X090 — ações de template UNIFICADAS (menu ⋮, duplicar que abre a cópia,
 * testar, excluir pelo modal do kit) e aprovação por papel.
 *
 * Antes: o cartão tinha 3 botões soltos (Editar/Duplicar/Excluir) e nenhum
 * Testar; a exclusão abria um `AlertDialog` próprio da tela; o "Duplicar"
 * criava a cópia e NÃO abria nada; o status era um `<Select>` livre, sem papel.
 *
 * Este teste renderiza o TalkXTemplates REAL e prova, pelo comportamento:
 *   1. Duplicar pelo menu cria a cópia E abre a cópia no editor;
 *   2. "Testar" só aparece para admin/supervisor (é o que o `talkx-send` aceita)
 *      e a janela mostra o recado do envio;
 *   3. Excluir passa pelo modal do kit e chama a exclusão do template certo;
 *   4. o `<Select>` livre de status saiu: no editor o status é o controle de
 *      aprovação (autor → "Enviar para revisão"; supervisor → "Aprovar").
 *
 * E os pontos da recusa do refazer 1 (TL-122):
 *   5. aprovar no editor renova o `expectedUpdatedAt` do próximo salvar;
 *   6. a janela de teste leva as variáveis personalizadas no envio;
 *   7. clicar no controle de status NÃO seleciona o cartão/linha;
 *   8. Duplicar no cabeçalho do editor abre a cópia (não só fecha o editor);
 *   9. "Enviar para revisão" só é oferecido ao AUTOR do template.
 */

const f = vi.hoisted(() => {
  const base = {
    description: null, category: 'geral', media_url: null, media_type: null,
    tags: [] as string[], custom_variables: [] as string[],
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    created_by: 'p-hugo',
  };
  return {
    roles: { isAdmin: false, isSupervisor: false },
    duplicateAsync: vi.fn(),
    deleteAsync: vi.fn(),
    updateAsync: vi.fn(),
    testTemplate: vi.fn(),
    templates: [
      // rascunho do PRÓPRIO usuário logado (`p-hugo`): pode enviar à revisão
      { ...base, id: 'tpl-A', name: 'Promoção do mês', content: 'Promoção do mês: 20% off', status: 'draft' as const, use_count: 10, custom_variables: ['primeiro_nome'] },
      { ...base, id: 'tpl-B', name: 'Boas-vindas', content: 'Olá {{nome}}', status: 'approved' as const, use_count: 3 },
      // rascunho criado por OUTRA pessoa: sem papel, não oferece "Enviar para revisão"
      { ...base, id: 'tpl-C', name: 'Rascunho de outro', content: 'Texto de outro autor', status: 'draft' as const, use_count: 1, created_by: 'p-outro' },
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
import { TalkXTemplateTestDialog } from '../TalkXTemplateTestDialog';

/** O cartão e a biblioteca lateral repetem o gatilho: o do CARTÃO vem primeiro. */
const triggerDoCartao = (nome: string) =>
  screen.getAllByRole('button', { name: `Ações do template ${nome}` })[0];

const abrirMenu = (nome: string) =>
  fireEvent.keyDown(triggerDoCartao(nome), { key: 'ArrowDown' });

const clicarItem = (nome: string) =>
  fireEvent.click(screen.getByRole('menuitem', { name: nome }));

/** Gatilho do menu ⋮ do CABEÇALHO do editor (label próprio, sem o nome do template). */
const abrirMenuDoEditor = () =>
  fireEvent.keyDown(screen.getByRole('button', { name: 'Ações do template' }), { key: 'ArrowDown' });

/** Cartão/linha clicável de um template, a partir do botão "Usar template". */
const containerDe = (indice: number) =>
  screen.getAllByRole('button', { name: 'Usar template' })[indice].closest('[role="button"]') as HTMLElement;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  // X089 (TL-121): a galeria lembra grade/lista no `localStorage`; um caso que troca
  // para "Lista" não pode deixar o próximo começar fora da grade.
  try { localStorage.removeItem('talkx.templates.view'); } catch { /* jsdom sem storage */ }
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

describe('TL-122 refazer 1 — regressões da unificação', () => {
  it('aprovar no editor renova o expectedUpdatedAt do próximo salvar (sem conflito)', async () => {
    f.roles.isSupervisor = true;
    // A RPC avança o `updated_at`: a primeira gravação devolve a linha nova.
    f.updateAsync.mockReset();
    f.updateAsync.mockResolvedValue({
      ...f.templates[0], status: 'approved', updated_at: '2026-02-02T00:00:00Z',
    });

    render(<TalkXTemplates onUseTemplate={vi.fn()} />);
    abrirMenu('Promoção do mês');
    clicarItem('Editar');
    await waitFor(() => expect(screen.getByText('Editar template')).toBeTruthy());

    // aprova usando o updated_at da linha carregada
    fireEvent.click(screen.getByRole('button', { name: /^Aprovar$/ }));
    await waitFor(() => expect(f.updateAsync).toHaveBeenCalledTimes(1));
    expect(f.updateAsync.mock.calls[0][0]).toMatchObject({ expectedUpdatedAt: '2026-01-01T00:00:00Z' });

    // salvar em seguida tem de usar o updated_at NOVO, não o velho
    fireEvent.click(screen.getByRole('button', { name: /Salvar template/ }));
    await waitFor(() => expect(f.updateAsync).toHaveBeenCalledTimes(2));
    expect(f.updateAsync.mock.calls[1][0]).toMatchObject({
      id: 'tpl-A', expectedUpdatedAt: '2026-02-02T00:00:00Z',
    });
  });

  it('a janela de teste leva as variáveis personalizadas do template no envio', async () => {
    f.roles.isAdmin = true;
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    abrirMenu('Promoção do mês');
    clicarItem('Editar');
    await waitFor(() => expect(screen.getByText('Editar template')).toBeTruthy());

    abrirMenuDoEditor();
    clicarItem('Testar');
    await waitFor(() => expect(screen.getByDisplayValue('5541999001234')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));

    await waitFor(() => expect(f.testTemplate).toHaveBeenCalledTimes(1));
    // tpl-A tem `custom_variables: ['primeiro_nome']`
    expect(f.testTemplate.mock.calls[0][0]).toMatchObject({ customVariables: ['primeiro_nome'] });
  });

  it('TalkXTemplateTestDialog repassa customVariables: a prop vence, sem prop usa a linha', async () => {
    const tpl = { ...f.templates[0], custom_variables: ['da_linha'] };

    const { unmount } = render(
      <TalkXTemplateTestDialog template={tpl as never} open onClose={vi.fn()} customVariables={['do_editor']} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));
    await waitFor(() => expect(f.testTemplate).toHaveBeenCalledTimes(1));
    expect(f.testTemplate.mock.calls[0][0]).toMatchObject({ customVariables: ['do_editor'] });

    unmount();

    render(<TalkXTemplateTestDialog template={tpl as never} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Enviar$/ }));
    await waitFor(() => expect(f.testTemplate).toHaveBeenCalledTimes(2));
    expect(f.testTemplate.mock.calls[1][0]).toMatchObject({ customVariables: ['da_linha'] });
  });

  it('clicar no controle de status dentro do cartão/linha não seleciona o container', async () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    // grade: cartão clicável com o controle dentro
    const cartao = containerDe(0);
    expect(cartao.className).not.toContain('bg-primary/5');
    fireEvent.click(screen.getAllByRole('button', { name: /^Enviar para revisão$/ })[0]);
    await waitFor(() => expect(f.updateAsync).toHaveBeenCalledTimes(1));
    expect(cartao.className).not.toContain('bg-primary/5');

    // lista: a linha tem o MESMO container clicável
    fireEvent.click(screen.getByTitle('Lista'));
    const linha = screen.getByText('Promoção do mês: 20% off').closest('[role="button"]') as HTMLElement;
    expect(linha.className).not.toContain('bg-primary/5');
    fireEvent.click(screen.getAllByRole('button', { name: /^Enviar para revisão$/ })[0]);
    await waitFor(() => expect(f.updateAsync).toHaveBeenCalledTimes(2));
    expect(linha.className).not.toContain('bg-primary/5');
  });

  it('Duplicar no cabeçalho do editor abre a cópia, não só fecha o editor', async () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    abrirMenu('Promoção do mês');
    clicarItem('Editar');
    await waitFor(() => expect(screen.getByText('Editar template')).toBeTruthy());

    abrirMenuDoEditor();
    clicarItem('Duplicar');

    await waitFor(() => expect(f.duplicateAsync).toHaveBeenCalledTimes(1));
    expect(f.duplicateAsync.mock.calls[0][0]).toMatchObject({ id: 'tpl-A' });

    // continua no editor, agora com a cópia aberta (antes: o editor fechava)
    await waitFor(() => expect(screen.getByDisplayValue('Promoção do mês (cópia)')).toBeTruthy());
    expect(screen.queryByText('Novo template')).toBeNull();
    expect(screen.getByText('Editar template')).toBeTruthy();
  });

  it('"Enviar para revisão" só é oferecido ao autor do template', async () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    // tpl-A é o rascunho do próprio usuário; tpl-C é rascunho de outra pessoa
    const cartaoDoAutor = containerDe(0);
    const cartaoDoOutro = containerDe(2);
    expect(cartaoDoOutro.textContent).toContain('Rascunho');

    expect(within(cartaoDoAutor).getByRole('button', { name: /^Enviar para revisão$/ })).toBeTruthy();
    expect(within(cartaoDoOutro).queryByRole('button', { name: /^Enviar para revisão$/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Enviar para revisão$/ })).toHaveLength(1);
  });
});
