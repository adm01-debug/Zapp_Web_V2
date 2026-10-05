import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

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

const variant = (id: string, templateId: string, content: string) => ({
  id, template_id: templateId, label: 'A' as const, content, media_url: null, media_type: null,
  weight: 100, created_at: '2026-01-01T00:00:00Z',
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
  return render(
    <TalkXTemplateEditor
      templates={[tplA as never, tplB as never]}
      isLoading={false}
      editing={tplA as never}
      onClose={vi.fn()}
    />,
  );
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

  it('excluir variante de outro template não chama deleteVariant', async () => {
    fetchVariants.mockResolvedValue([variant('var-A', 'tpl-A', 'variante-A-conteudo')]);

    renderEditor();
    switchToB();
    fireEvent.click(variantsToggle());
    await flush();

    const textarea = screen.getAllByDisplayValue('variante-A-conteudo')[0];
    const row = textarea.closest('div[class*="rounded-xl"]') as HTMLElement;
    fireEvent.click(row.querySelector('button') as HTMLElement);
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
  it('onBlur chama saveVariant e o clique em x chama deleteVariant', async () => {
    fetchVariants.mockResolvedValue([variant('var-A', 'tpl-A', 'variante do ativo')]);
    countVariantRecipients.mockResolvedValue(0);

    renderEditor(); // editing = tpl-A, logo o template ativo é o A

    fireEvent.click(variantsToggle());
    await flush();

    const textarea = screen.getAllByDisplayValue('variante do ativo')[0];

    // salvar: onBlur da variante que pertence ao template ativo
    fireEvent.blur(textarea);
    await flush();
    expect(saveVariant).toHaveBeenCalledTimes(1);
    expect(saveVariant.mock.calls[0][0]).toBe('tpl-A');
    expect(saveVariant.mock.calls[0][1]).toMatchObject({ id: 'var-A', template_id: 'tpl-A' });

    // excluir: o clique em "x" da linha da variante
    const row = textarea.closest('div[class*="rounded-xl"]') as HTMLElement;
    fireEvent.click(row.querySelector('button') as HTMLElement);
    await flush();
    expect(countVariantRecipients).toHaveBeenCalledWith('var-A');
    expect(deleteVariant).toHaveBeenCalledWith('var-A');
  });
});

/**
 * R2-MOD-024 (refazer 2/2) — a origem ativa não pode ficar obsoleta quando o
 * template ativo muda por CRIAÇÃO ou DUPLICAÇÃO, isto é, sem passar por
 * `loadTemplate`. O editor recebe o template recém-criado/duplicado como
 * `editing` e o ref que guarda a origem (`activeTemplateIdRef`) precisa
 * acompanhar essa troca; caso contrário `isActiveOrigin` recusaria variantes e
 * histórico legítimos e as ações saveVariant/deleteVariant do novo template.
 */
const tplDup: TalkXTemplate = {
  ...tplA, id: 'tpl-dup', name: 'Template A (cópia)', content: 'corpo do template duplicado', status: 'draft',
};

/** Editor aberto direto no template recém-criado/duplicado (troca do ativo sem `loadTemplate`). */
function renderNewTemplateEditor() {
  return render(
    <TalkXTemplateEditor
      key="novo-template"
      templates={[tplA as never, tplDup as never]}
      isLoading={false}
      editing={tplDup as never}
      onClose={vi.fn()}
    />,
  );
}

describe('R2-MOD-024 — template recém-criado/duplicado (sem loadTemplate) é o ativo', () => {
  it('carrega variantes e histórico do template criado/duplicado', async () => {
    fetchVariants.mockResolvedValue([variant('var-dup', 'tpl-dup', 'variante do novo')]);
    fetchVersionHistory.mockResolvedValue([version('ver-dup', 'tpl-dup', 'Versao do novo')]);

    renderNewTemplateEditor();

    fireEvent.click(variantsToggle());
    await flush();
    expect(fetchVariants).toHaveBeenCalledWith('tpl-dup');
    expect(screen.getAllByDisplayValue('variante do novo').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Ver versões' }));
    await flush();
    expect(fetchVersionHistory).toHaveBeenCalledWith('tpl-dup');
    expect(screen.getAllByText((_, el) => el?.tagName === 'P' && el.textContent === 'v2 · Versao do novo').length).toBeGreaterThan(0);
  });

  it('saveVariant no onBlur e deleteVariant no clique funcionam no template criado/duplicado', async () => {
    fetchVariants.mockResolvedValue([variant('var-dup', 'tpl-dup', 'variante do novo')]);
    countVariantRecipients.mockResolvedValue(0);

    renderNewTemplateEditor();
    fireEvent.click(variantsToggle());
    await flush();

    const textarea = screen.getAllByDisplayValue('variante do novo')[0];

    fireEvent.blur(textarea);
    await flush();
    expect(saveVariant).toHaveBeenCalledTimes(1);
    expect(saveVariant.mock.calls[0][0]).toBe('tpl-dup');
    expect(saveVariant.mock.calls[0][1]).toMatchObject({ id: 'var-dup', template_id: 'tpl-dup' });

    const row = textarea.closest('div[class*="rounded-xl"]') as HTMLElement;
    fireEvent.click(row.querySelector('button') as HTMLElement);
    await flush();
    expect(countVariantRecipients).toHaveBeenCalledWith('var-dup');
    expect(deleteVariant).toHaveBeenCalledWith('var-dup');
  });

  it('variante do template ANTERIOR continua recusada quando o ativo é o criado/duplicado', async () => {
    fetchVariants.mockResolvedValue([variant('var-A', 'tpl-A', 'variante do antigo')]);

    renderNewTemplateEditor();
    fireEvent.click(variantsToggle());
    await flush();

    const textarea = screen.getAllByDisplayValue('variante do antigo')[0];
    fireEvent.blur(textarea);
    await flush();
    expect(saveVariant).not.toHaveBeenCalled();

    const row = textarea.closest('div[class*="rounded-xl"]') as HTMLElement;
    fireEvent.click(row.querySelector('button') as HTMLElement);
    await flush();
    expect(deleteVariant).not.toHaveBeenCalled();
  });

  it('mudança do ativo para o recém-duplicado (sem loadTemplate) recarrega a origem', async () => {
    fetchVariants.mockImplementation((id: string) =>
      Promise.resolve([
        id === 'tpl-dup'
          ? variant('var-dup', 'tpl-dup', 'variante do novo')
          : variant('var-A', 'tpl-A', 'variante do antigo'),
      ]));

    const view = render(
      <TalkXTemplateEditor
        key="tpl-a"
        templates={[tplA as never, tplDup as never]}
        isLoading={false}
        editing={tplA as never}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(variantsToggle());
    await flush();
    expect(fetchVariants).toHaveBeenCalledWith('tpl-A');
    expect(screen.getAllByDisplayValue('variante do antigo').length).toBeGreaterThan(0);

    // o editor passa a apontar para o template recém-criado/duplicado sem loadTemplate
    view.rerender(
      <TalkXTemplateEditor
        key="tpl-dup"
        templates={[tplA as never, tplDup as never]}
        isLoading={false}
        editing={tplDup as never}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(variantsToggle());
    await flush();

    expect(fetchVariants).toHaveBeenLastCalledWith('tpl-dup');
    expect(screen.getAllByDisplayValue('variante do novo').length).toBeGreaterThan(0);
    expect(screen.queryAllByDisplayValue('variante do antigo')).toHaveLength(0);
  });
});
