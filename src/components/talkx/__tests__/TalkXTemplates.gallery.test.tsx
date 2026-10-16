/**
 * X089 (TL-121) — galeria do mock 04: cartão fiel, filtros, lista, paginação e estados.
 *
 * O cartão dizia "cartão com bolha própria, corte seco em 140 caracteres, 'Agora ✓✓'
 * fixo e mídia como '📎 tipo'" e "sem contagem de variáveis nem data". Esta prova
 * renderiza a TELA REAL (só o hook de dados é mockado) e confere o que o usuário vê:
 *
 *   1. o cartão mostra nome, categoria, chips de tag com "+N", a contagem de
 *      variáveis do texto, "Atualizado em …" e "N usos";
 *   2. a hora da bolha vem de `updated_at` de CADA template (antes era o texto fixo
 *      "Agora ✓✓", que mentia para todo template);
 *   3. a mídia do template aparece em miniatura larga (só imagem vira `<img>`);
 *   4. "Usar template" fica desabilitado, com o motivo, fora de "Aprovado" (A8);
 *   5. filtrar depois de estar na 2ª página volta para a 1ª;
 *   6. o tamanho de página é 12 e as opções são 12/24/48;
 *   7. a preferência grade/lista sai do `localStorage` e volta para ele, com leitura
 *      defensiva de valor corrompido.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// O jsdom não implementa captura de ponteiro; o gatilho do Select (Radix) chama
// `hasPointerCapture` no pointerdown que o abre.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

const dados = vi.hoisted(() => ({ templates: [] as Array<Record<string, unknown>> }));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: dados.templates,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
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

import { TalkXTemplates } from '../TalkXTemplates';
import { fmtTime } from '../kit/format';

const T_ANTIGO = '2026-09-01T09:05:00.000Z';
const T_RECENTE = '2026-10-08T14:35:00.000Z';
const CHAVE_PREFERENCIA = 'talkx.templates.view';

function tpl(over: Record<string, unknown> = {}) {
  return {
    id: 'tpl-base',
    name: 'Template base',
    description: 'Descrição do template',
    category: 'geral',
    content: 'Olá, tudo bem?',
    media_url: null,
    media_type: null,
    tags: [] as string[],
    status: 'approved',
    use_count: 0,
    created_by: null,
    custom_variables: [] as string[],
    current_version_id: null,
    created_at: T_ANTIGO,
    updated_at: T_ANTIGO,
    ...over,
  };
}

function muitos(n: number, over: Record<string, unknown> = {}) {
  return Array.from({ length: n }, (_, i) => tpl({
    id: `tpl-${i + 1}`, name: `Template ${i + 1}`, content: `Mensagem do template ${i + 1}`, ...over,
  }));
}

/** Abre um select do Radix pelo pointerdown (mesma técnica do teste de tamanho de página). */
function abrirSelect(alvo: HTMLElement) {
  fireEvent.pointerDown(alvo, { button: 0, ctrlKey: false, pointerType: 'mouse' });
}

beforeEach(() => {
  dados.templates = [];
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('X089 — galeria de templates (mock 04)', () => {
  it('cartão fiel: nome, categoria, chips com "+N", N variáveis, atualização e usos', () => {
    dados.templates = [tpl({
      id: 'tpl-1',
      name: 'Promoções de outubro',
      content: 'Oi {{nome}}, {{empresa}} e {{ultima_compra}}',
      category: 'promocao',
      tags: ['promo', 'verao', 'black'],
      use_count: 12,
      updated_at: T_RECENTE,
    })];

    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    // O nome do template também aparece no rail "Mais usados": tudo que é do cartão é
    // conferido DENTRO do cartão.
    const card = document.querySelector('[data-talkx-template-card="tpl-1"]') as HTMLElement;
    expect(within(card).getByText('Promoções de outubro')).toBeTruthy();
    expect(within(card).getByText('promocao')).toBeTruthy();
    expect(within(card).getByText('Aprovado')).toBeTruthy();
    // categoria + até 2 tags + "+N" (3 tags → 2 visíveis + "+1")
    expect(within(card).getByText('#promo')).toBeTruthy();
    expect(within(card).getByText('#verao')).toBeTruthy();
    expect(within(card).queryByText('#black')).toBeNull();
    expect(within(card).getByText('+1')).toBeTruthy();
    // contagem de variáveis do texto (antes não existia)
    expect(within(card).getByText('3 variáveis: {{nome}}, {{empresa}}, …')).toBeTruthy();
    // data de atualização (antes não existia; fmtDateTime estava importado sem uso)
    expect(within(card).getByText(/Atualizado em/)).toBeTruthy();
    expect(within(card).getByText('12 usos')).toBeTruthy();
  });

  it('a hora da bolha é a de `updated_at` de cada template — nunca "Agora ✓✓"', () => {
    dados.templates = [
      tpl({ id: 'tpl-1', name: 'Antigo', updated_at: T_ANTIGO }),
      tpl({ id: 'tpl-2', name: 'Recente', updated_at: T_RECENTE }),
    ];

    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    expect(screen.queryByText('Agora ✓✓')).toBeNull();
    expect(screen.getByText(`${fmtTime(T_ANTIGO)} ✓✓`)).toBeTruthy();
    expect(screen.getByText(`${fmtTime(T_RECENTE)} ✓✓`)).toBeTruthy();
  });

  it('mídia: uma miniatura larga por template e só imagem vira <img>', () => {
    dados.templates = [
      tpl({ id: 'tpl-img', name: 'Com imagem', media_url: 'https://cdn.exemplo/x.jpg', media_type: 'image' }),
      tpl({ id: 'tpl-doc', name: 'Com documento', media_url: 'https://cdn.exemplo/y.pdf', media_type: 'document' }),
    ];

    const { container } = render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    const imagens = container.querySelectorAll('img');
    expect(imagens).toHaveLength(1);
    expect(imagens[0].getAttribute('src')).toBe('https://cdn.exemplo/x.jpg');
    // documento não vira <img>, mas o tipo não some da tela
    expect(screen.getByText('document')).toBeTruthy();
  });

  it('"Usar template" fica desabilitado, com motivo, fora de "Aprovado" (A8)', () => {
    dados.templates = [
      tpl({ id: 'tpl-rascunho', name: 'Rascunho', status: 'draft' }),
      tpl({ id: 'tpl-aprovado', name: 'Aprovado', status: 'approved' }),
    ];

    const { container } = render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    const rascunho = container.querySelector('[data-talkx-template-card="tpl-rascunho"]') as HTMLElement;
    const botaoRascunho = within(rascunho).getByRole('button', { name: 'Usar template' });
    expect(botaoRascunho).toBeDisabled();
    expect(botaoRascunho.getAttribute('title')).toMatch(/aprovad/i);

    const aprovado = container.querySelector('[data-talkx-template-card="tpl-aprovado"]') as HTMLElement;
    const botaoAprovado = within(aprovado).getByRole('button', { name: 'Usar template' });
    expect(botaoAprovado).not.toBeDisabled();
  });

  it('paginação: 12 por página é o padrão e as opções são 12/24/48', () => {
    dados.templates = muitos(30);

    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    expect(screen.getByText('Mostrando 1 a 12 de 30 templates')).toBeTruthy();

    const linha = screen.getByText(/^Mostrando/).parentElement as HTMLElement;
    abrirSelect(within(linha).getByRole('combobox'));

    expect(screen.getByRole('option', { name: '12 por página' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '24 por página' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '48 por página' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '8 por página' })).toBeNull();
  });

  it('filtrar depois de estar na 2ª página volta para a 1ª', () => {
    dados.templates = [
      ...muitos(25, { status: 'approved' }),
      ...Array.from({ length: 5 }, (_, i) => tpl({ id: `draft-${i + 1}`, name: `Rascunho ${i + 1}`, status: 'draft' })),
    ];

    render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    expect(screen.getByText('Mostrando 1 a 12 de 30 templates')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('Mostrando 13 a 24 de 30 templates')).toBeTruthy();

    // filtro de status: "Rascunho" (5 resultados → uma página só)
    abrirSelect(screen.getByRole('combobox', { name: 'Todos os status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Rascunho' }));

    expect(screen.getByText('Mostrando 1 a 5 de 5 templates')).toBeTruthy();
    expect(screen.queryByText('Mostrando 13 a 24 de 30 templates')).toBeNull();
  });

  it('modo lista: usa a preferência salva e a grava ao trocar', () => {
    dados.templates = [tpl({ id: 'tpl-1', name: 'Boas-vindas', tags: ['boasvindas'] })];
    localStorage.setItem(CHAVE_PREFERENCIA, 'list');

    const { container } = render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    expect(container.querySelector('[data-talkx-view="list"]')).toBeTruthy();
    expect(screen.getByText('Descrição do template')).toBeTruthy();
    expect(screen.getByText('boasvindas')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Grade' }));

    expect(localStorage.getItem(CHAVE_PREFERENCIA)).toBe('grid');
    expect(container.querySelector('[data-talkx-view="grid"]')).toBeTruthy();
  });

  it('preferência corrompida no localStorage não derruba a tela: cai na grade', () => {
    dados.templates = [tpl({ id: 'tpl-1' })];
    localStorage.setItem(CHAVE_PREFERENCIA, '{"nao":"e-json-valido"');

    const { container } = render(<TalkXTemplates onUseTemplate={vi.fn()} />);

    expect(container.querySelector('[data-talkx-view="grid"]')).toBeTruthy();
    const card = container.querySelector('[data-talkx-template-card="tpl-1"]') as HTMLElement;
    expect(within(card).getByText('Template base')).toBeTruthy();
  });
});
