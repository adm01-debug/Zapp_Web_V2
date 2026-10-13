import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

/** O editor consome o widget "Em andamento" (campanhas): mock vazio por padrão. */
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ campaigns: [], isLoading: false, isError: false, error: null, isLive: false, refetchCampaigns: vi.fn() }),
}));

/** O editor passou a consumir os KPIs (react-query real): precisa do provider. */
const withQuery = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>
);

/**
 * R2-MOD-024 (item 102 / P1) — "Respostas atrasadas de variantes e histórico são
 * aplicadas ao template seguinte".
 *
 * Contrato do defeito: os loaders aplicavam setVariants/setVersions sem comparar o
 * template de origem. Pedir variantes/histórico de A, trocar para B e receber a
 * resposta de A DEPOIS da de B substituía o painel de B por dados de A — e um
 * onBlur/clique em cima dessa linha enviava payload de A enquanto o editor dizia
 * estar em B.
 *
 * Este teste fixa os dois aceites do item:
 *   1. No cenário A lento / B rápido, só os dados de B permanecem acionáveis.
 *   2. Salvar/excluir/restaurar recusa payload cuja origem ≠ template ativo.
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

import { TalkXTemplateEditor } from '../TalkXTemplateEditor';
import { TalkXTemplateVariants } from '../TalkXTemplateVariants';

type TalkXTemplate = {
  id: string; name: string; description: string | null; category: string; content: string;
  media_url: string | null; media_type: string | null; tags: string[]; status: 'draft' | 'review' | 'approved';
  use_count: number; created_by: string | null; custom_variables: string[]; created_at: string; updated_at: string;
};

const tplA: TalkXTemplate = {
  id: 'tpl-A', name: 'Template A', description: null, category: 'geral', content: 'corpo do template A',
  media_url: null, media_type: null, tags: [], status: 'approved', use_count: 0, created_by: null,
  custom_variables: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};
const tplB: TalkXTemplate = {
  ...tplA, id: 'tpl-B', name: 'Template B', content: 'corpo do template B',
};

const variant = (id: string, templateId: string, content: string, label: 'A' | 'B' | 'C' = 'A', weight = 100) => ({
  id, template_id: templateId, label, content, media_url: null, media_type: null,
  weight, created_at: '2026-01-01T00:00:00Z',
});

const version = (id: string, templateId: string, name: string) => ({
  id, template_id: templateId, version_number: 2, name, description: null, content: `corpo de ${name}`,
  category: 'geral', status: 'approved', media_url: null, media_type: null, tags: [], custom_variables: [],
  created_at: '2026-01-02T00:00:00Z',
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => act(async () => { await Promise.resolve(); });

function renderEditor() {
  return render(withQuery(
    <TalkXTemplateEditor
      templates={[tplA as never, tplB as never]}
      isLoading={false}
      editing={tplA as never}
      onClose={vi.fn()}
    />,
  ));
}

/** Painel de variantes: há duas cópias do botão (rail xl + faixa < xl). Usa a primeira. */
const variantsToggle = () => screen.getAllByRole('button', { name: 'Adicionar variante' })[0];
const switchToB = () => fireEvent.click(screen.getByText('Template B').closest('button') as HTMLElement);

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('R2-MOD-024 — resposta atrasada não contamina o template seguinte', () => {
  it('variantes: resposta lenta de A não sobrescreve o painel de B', async () => {
    const slowA = deferred<ReturnType<typeof variant>[]>();
    fetchVariants.mockImplementation((id: string) =>
      id === 'tpl-A' ? slowA.promise : Promise.resolve([variant('var-B', 'tpl-B', 'variante-B-conteudo')]));

    renderEditor();

    // abre o painel de variantes de A (requisição fica pendente)
    fireEvent.click(variantsToggle());
    expect(fetchVariants).toHaveBeenCalledWith('tpl-A');

    // troca para B e abre o painel de B (resposta imediata)
    switchToB();
    fireEvent.click(variantsToggle());
    await flush();
    expect(screen.getAllByDisplayValue('variante-B-conteudo').length).toBeGreaterThan(0);

    // agora a resposta atrasada de A chega: NÃO pode substituir o painel de B
    await act(async () => { slowA.resolve([variant('var-A', 'tpl-A', 'variante-A-conteudo')]); await slowA.promise; });

    expect(screen.queryAllByDisplayValue('variante-A-conteudo')).toHaveLength(0);
    expect(screen.getAllByDisplayValue('variante-B-conteudo').length).toBeGreaterThan(0);
  });

  it('histórico: resposta lenta de A não sobrescreve o histórico de B', async () => {
    const slowA = deferred<ReturnType<typeof version>[]>();
    fetchVersionHistory.mockImplementation((id: string) =>
      id === 'tpl-A' ? slowA.promise : Promise.resolve([version('ver-B', 'tpl-B', 'Versao B')]));

    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Ver versões' }));
    expect(fetchVersionHistory).toHaveBeenCalledWith('tpl-A');

    switchToB();
    fireEvent.click(screen.getByRole('button', { name: 'Ver versões' }));
    await flush();
    expect(screen.getAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao B').length).toBeGreaterThan(0);

    await act(async () => { slowA.resolve([version('ver-A', 'tpl-A', 'Versao A')]); await slowA.promise; });

    expect(screen.queryAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao A')).toHaveLength(0);
    expect(screen.getAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao B').length).toBeGreaterThan(0);
  });

  it('loading: trocar A→B com o histórico de A pendente não deixa B em estado de carregamento', async () => {
    const slowA = deferred<ReturnType<typeof version>[]>();
    fetchVersionHistory.mockImplementation((id: string) =>
      id === 'tpl-A' ? slowA.promise : Promise.resolve([version('ver-B', 'tpl-B', 'Versao B')]));

    renderEditor();

    // abre o histórico de A enquanto ele ainda está pendente ("Carregando...")
    fireEvent.click(screen.getByRole('button', { name: 'Ver versões' }));
    expect(fetchVersionHistory).toHaveBeenCalledWith('tpl-A');
    expect(screen.getAllByText('Carregando...').length).toBeGreaterThan(0);

    // troca A→B e abre o histórico de B (resposta imediata)
    switchToB();
    fireEvent.click(screen.getByRole('button', { name: 'Ver versões' }));
    await flush();
    expect(screen.getAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao B').length).toBeGreaterThan(0);

    // a resposta atrasada de A chega DEPOIS: é descartada e não pode prender o loading de B
    await act(async () => { slowA.resolve([version('ver-A', 'tpl-A', 'Versao A')]); await slowA.promise; });
    await flush();

    expect(screen.queryAllByText('Carregando...')).toHaveLength(0);
    expect(screen.getAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao B').length).toBeGreaterThan(0);
    expect(screen.queryAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao A')).toHaveLength(0);
  });

  it('loading: resposta atrasada de A não mexe no loading do histórico de B em andamento', async () => {
    const slowA = deferred<ReturnType<typeof version>[]>();
    const slowB = deferred<ReturnType<typeof version>[]>();
    fetchVersionHistory.mockImplementation((id: string) => (id === 'tpl-A' ? slowA.promise : slowB.promise));

    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Ver versões' })); // A pendente
    switchToB();
    fireEvent.click(screen.getByRole('button', { name: 'Ver versões' })); // B pendente
    await flush();
    expect(screen.getAllByText('Carregando...').length).toBeGreaterThan(0);

    // A chega atrasada: não aplica dados e não pode zerar o loading de B (ainda pendente)
    await act(async () => { slowA.resolve([version('ver-A', 'tpl-A', 'Versao A')]); await slowA.promise; });
    await flush();
    expect(screen.getAllByText('Carregando...').length).toBeGreaterThan(0);
    expect(screen.queryAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao A')).toHaveLength(0);

    // B resolve: agora sim o painel mostra o histórico de B e sai do loading
    await act(async () => { slowB.resolve([version('ver-B', 'tpl-B', 'Versao B')]); await slowB.promise; });
    await flush();
    expect(screen.queryAllByText('Carregando...')).toHaveLength(0);
    expect(screen.getAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao B').length).toBeGreaterThan(0);
  });
});

describe('R2-MOD-024 — mutação de origem estranha ao template ativo é recusada', () => {
  it('onBlur de variante de outro template não chama saveVariant', async () => {
    // O painel de B não pode estar acionando payload de A.
    fetchVariants.mockResolvedValue([variant('var-A', 'tpl-A', 'variante-A-conteudo')]);

    renderEditor();
    switchToB();
    fireEvent.click(variantsToggle());
    await flush();

    const textarea = screen.getAllByDisplayValue('variante-A-conteudo')[0];
    fireEvent.blur(textarea);
    await flush();

    expect(saveVariant).not.toHaveBeenCalled();
  });

  it('salvar conjunto com variante de outro template não chama saveVariant', async () => {
    fetchVariants.mockResolvedValue([variant('var-A', 'tpl-A', 'rascunho-A-em-B', 'B', 100)]);

    renderEditor();
    switchToB();
    fireEvent.click(variantsToggle());
    await flush();

    expect(screen.getAllByDisplayValue('rascunho-A-em-B').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));
    await flush();

    expect(saveVariant).not.toHaveBeenCalled();
  });

  it('rascunho sem id de A é reiniciado quando o template muda antes de salvar', async () => {
    const onSaveVariants = vi.fn((drafts: unknown[]) => {
      drafts.forEach((draft) => saveVariant('tpl-B', draft));
    });
    const props = {
      baseContent: 'rascunho de A',
      variants: [],
      onRemoveVariant: vi.fn(),
      onSaveVariants,
      onDeclareWinner: vi.fn(),
    };
    const view = render(<TalkXTemplateVariants templateId="tpl-A" {...props} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar variante B' }));
    expect(screen.getByDisplayValue('rascunho de A')).toBeInTheDocument();

    view.rerender(<TalkXTemplateVariants templateId="tpl-B" {...props} baseContent="corpo do template B" />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));
    await flush();

    const lastSaveDrafts = onSaveVariants.mock.calls[onSaveVariants.mock.calls.length - 1]?.[0] ?? [];
    expect(lastSaveDrafts).toEqual([]);
    expect(saveVariant).not.toHaveBeenCalledWith('tpl-B', expect.objectContaining({ content: 'rascunho de A' }));
  });

  it('excluir variante de outro template não chama deleteVariant', async () => {
    fetchVariants.mockResolvedValue([variant('var-A', 'tpl-A', 'variante-A-conteudo')]);

    renderEditor();
    switchToB();
    fireEvent.click(variantsToggle());
    await flush();

    const textarea = screen.getAllByDisplayValue('variante-A-conteudo')[0];
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir variante A' })[0]);
    await flush();

    expect(deleteVariant).not.toHaveBeenCalled();
  });

  it('não exclui variante de A quando a contagem termina após a troca para B', async () => {
    const pendingCount = deferred<number>();
    fetchVariants.mockResolvedValue([variant('var-A', 'tpl-A', 'variante-A-conteudo')]);
    countVariantRecipients.mockReturnValue(pendingCount.promise);

    renderEditor();
    fireEvent.click(variantsToggle());
    await flush();

    const textarea = screen.getAllByDisplayValue('variante-A-conteudo')[0];
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir variante A' })[0]);
    expect(countVariantRecipients).toHaveBeenCalledWith('var-A');

    switchToB();
    await act(async () => { pendingCount.resolve(0); await pendingCount.promise; });
    await flush();

    expect(deleteVariant).not.toHaveBeenCalled();
  });

  it('restaurar versão de outro template não aplica os campos', async () => {
    fetchVersionHistory.mockResolvedValue([version('ver-A', 'tpl-A', 'Versao Estranha')]);

    renderEditor();
    switchToB();
    fireEvent.click(screen.getByRole('button', { name: 'Ver versões' }));
    await flush();

    // O botão de restaurar é o único botão dentro da linha da versão.
    const versionLabel = screen
      .getAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao Estranha')[0];
    const row = versionLabel.closest('div.flex') as HTMLElement;
    fireEvent.click(row.querySelector('button') as HTMLElement);
    await flush();

    expect(screen.getAllByDisplayValue('Template B').length).toBeGreaterThan(0);
  });
});

describe('R2-MOD-024 — variante do template ativo continua salvando e excluindo', () => {
  it('o blur não grava; "Salvar variações" grava o conjunto e o clique em x exclui', async () => {
    fetchVariants.mockResolvedValue([variant('var-A', 'tpl-A', 'variante do ativo')]);
    countVariantRecipients.mockResolvedValue(0);

    renderEditor(); // editing = tpl-A, logo o template ativo é o A

    fireEvent.click(variantsToggle());
    await flush();

    const textarea = screen.getAllByDisplayValue('variante do ativo')[0];

    // X097: não existe mais save no blur — o conjunto sai pelo botão
    fireEvent.blur(textarea);
    await flush();
    expect(saveVariant).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));
    await flush();
    expect(saveVariant).toHaveBeenCalledTimes(1);
    expect(saveVariant.mock.calls[0][0]).toBe('tpl-A');
    expect(saveVariant.mock.calls[0][1]).toMatchObject({ id: 'var-A', template_id: 'tpl-A' });

    // excluir: o clique em "x" da linha da variante
    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir variante A' })[0]);
    await flush();
    expect(countVariantRecipients).toHaveBeenCalledWith('var-A');
    expect(deleteVariant).toHaveBeenCalledWith('var-A');
  });

  // X050 — excluir variante com envios não apaga antes da confirmação do fluxo de variações.
  it('excluir variante com envios mostra a confirmação e só apaga depois de confirmar', async () => {
    fetchVariants.mockResolvedValue([variant('var-A', 'tpl-A', 'variante do ativo')]);
    countVariantRecipients.mockResolvedValue(7);

    renderEditor();
    fireEvent.click(variantsToggle());
    await flush();

    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir variante A' })[0]);
    await flush();

    // Nada é apagado antes da confirmação, e a caixinha cinza do navegador não existe.
    expect(deleteVariant).not.toHaveBeenCalled();
    expect(screen.getByText(/usada em 7 envio\(s\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await flush();

    expect(countVariantRecipients).toHaveBeenCalledWith('var-A');
    expect(deleteVariant).toHaveBeenCalledWith('var-A');
  });

  it('interrompe o save do conjunto ao trocar para B durante a primeira gravação', async () => {
    const pendingSave = deferred<void>();
    fetchVariants.mockImplementation((id: string) => Promise.resolve(
      id === 'tpl-A'
        ? [variant('var-A', 'tpl-A', 'variante do ativo', 'A', 100), variant('var-B', 'tpl-A', 'segunda variante do ativo', 'B', 0)]
        : [],
    ));
    saveVariant.mockImplementationOnce(() => pendingSave.promise).mockResolvedValue(undefined);

    renderEditor();
    fireEvent.click(variantsToggle());
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));
    expect(saveVariant).toHaveBeenCalledTimes(1);
    expect(saveVariant).toHaveBeenCalledWith('tpl-A', expect.objectContaining({ id: 'var-A', template_id: 'tpl-A' }));

    switchToB();
    await act(async () => { pendingSave.resolve(); await pendingSave.promise; });
    await flush();

    // a segunda variante do template antigo não é gravada depois da troca
    expect(saveVariant).toHaveBeenCalledTimes(1);
  });
});

const tplDup: TalkXTemplate = {
  ...tplA, id: 'tpl-dup', name: 'Template A (cópia)', content: 'corpo do template duplicado', status: 'draft',
};

describe('R2-MOD-024 — inventário dos caminhos que trocam o template ativo', () => {
  it('rerender de editing não troca o ativo; a troca real pela biblioteca sincroniza origem e mutações', async () => {
    fetchVariants.mockImplementation((id: string) =>
      Promise.resolve([
        id === 'tpl-B'
          ? variant('var-B', 'tpl-B', 'variante do ativo B')
          : variant('var-A', 'tpl-A', 'variante do ativo A'),
      ]));
    fetchVersionHistory.mockImplementation((id: string) => Promise.resolve([
      id === 'tpl-B' ? version('ver-B', 'tpl-B', 'Versao B') : version('ver-A', 'tpl-A', 'Versao A'),
    ]));
    countVariantRecipients.mockResolvedValue(0);

    const view = render(withQuery(
      <TalkXTemplateEditor
        templates={[tplA as never, tplB as never, tplDup as never]}
        isLoading={false}
        editing={tplA as never}
        onClose={vi.fn()}
      />,
    ));

    // Trocar somente a prop `editing`, sem key/remontagem, não chama nenhum setter de
    // activeTemplateId: criação e duplicação fecham o editor em produção.
    view.rerender(withQuery(
      <TalkXTemplateEditor
        templates={[tplA as never, tplB as never, tplDup as never]}
        isLoading={false}
        editing={tplDup as never}
        onClose={vi.fn()}
      />,
    ));
    fireEvent.click(variantsToggle());
    await flush();
    expect(fetchVariants).toHaveBeenLastCalledWith('tpl-A');
    expect(screen.getAllByDisplayValue('variante do ativo A').length).toBeGreaterThan(0);

    // O único caminho real de troca durante a mesma montagem é a biblioteca.
    fireEvent.click(screen.getByText('Template B').closest('button') as HTMLElement);
    fireEvent.click(variantsToggle());
    await flush();
    expect(fetchVariants).toHaveBeenLastCalledWith('tpl-B');
    const textarea = screen.getAllByDisplayValue('variante do ativo B')[0];

    fireEvent.click(screen.getByRole('button', { name: 'Ver versões' }));
    await flush();
    expect(fetchVersionHistory).toHaveBeenLastCalledWith('tpl-B');
    expect(screen.getAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao B').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));
    await flush();
    expect(saveVariant).toHaveBeenCalledWith('tpl-B', expect.objectContaining({ id: 'var-B', template_id: 'tpl-B' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Excluir variante A' })[0]);
    await flush();
    expect(countVariantRecipients).toHaveBeenCalledWith('var-B');
    expect(deleteVariant).toHaveBeenCalledWith('var-B');
  });
});
