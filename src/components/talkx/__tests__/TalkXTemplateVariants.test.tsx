import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

/** O editor consome o widget "Em andamento" (campanhas): mock vazio por padrão. */
vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({ campaigns: [], isLoading: false, isError: false, error: null, isLive: false, refetchCampaigns: vi.fn() }),
}));

/**
 * X097 (TL-126) — aba Variações A/B: colunas lado a lado, pesos que fecham 100%,
 * resultado por variante e "Declarar vencedora".
 *
 * Antes: a UI de variantes existia DUAS vezes no editor, salvava no blur sem
 * retorno, só avisava quando a soma não era 100 e criava a variante como cópia
 * do texto com mídia nula. Aqui ficam fixados os aceites da etapa:
 *   1. mudar o peso de B para 70 leva o controle a 30;
 *   2. soma diferente de 100 não chega ao save (nem à RPC, no editor);
 *   3. remover variante com destinatários mostra a mensagem antes de excluir;
 *   4. o resultado de CAP-070 aparece por coluna ("sem dados ainda" sem dado);
 *   5. "Declarar vencedora" bloqueada abaixo de 100 enviadas sem a marcação.
 */

const fetchVariants = vi.fn();
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
    fetchVersionHistory: vi.fn(),
    fetchVariants,
    saveVariant,
    deleteVariant,
    countVariantRecipients,
  }),
}));

import { TalkXTemplateEditor } from '../TalkXTemplateEditor';
import { TalkXTemplateVariants } from '../TalkXTemplateVariants';
import type { TalkXVariantResult } from '../talkxVariants';

type TemplateVariantShape = {
  id: string; template_id: string; label: 'A' | 'B' | 'C'; content: string;
  media_url: string | null; media_type: string | null; weight: number; created_at: string;
};

const variant = (label: 'A' | 'B' | 'C', weight: number, content?: string): TemplateVariantShape => ({
  id: `var-${label}`, template_id: 'tpl-A', label, content: content ?? `texto da variante ${label}`,
  media_url: null, media_type: null, weight, created_at: '2026-01-01T00:00:00Z',
});

const result = (label: 'A' | 'B' | 'C', sent: number, replies: number): TalkXVariantResult => ({
  variant_id: `var-${label}`, recipients: sent + 20, sent, delivered: sent - 5, replies,
});

const flush = () => act(async () => { await Promise.resolve(); });

type VariantsProps = React.ComponentProps<typeof TalkXTemplateVariants>;

function renderVariants(overrides: Partial<VariantsProps> = {}) {
  const props: VariantsProps = {
    templateId: 'tpl-A',
    baseContent: 'texto base do template',
    variants: [],
    onRemoveVariant: vi.fn(),
    onSaveVariants: vi.fn(),
    onDeclareWinner: vi.fn(),
    ...overrides,
  };
  render(<TalkXTemplateVariants {...props} />);
}

const controlePeso = () => screen.getByTestId('talkx-variant-controle-peso');

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn(() => true));
});

describe('X097 — pesos das colunas fecham 100%', () => {
  it('mudar o peso de B para 70 leva o controle a 30', () => {
    renderVariants({ variants: [variant('B', 50)] });
    expect(controlePeso()).toHaveTextContent('50%');

    fireEvent.change(screen.getByLabelText('Peso da variante B'), { target: { value: '70' } });

    expect(controlePeso()).toHaveTextContent('30%');
  });

  it('"Dividir igualmente" reparte os 100% entre o controle e as variantes', () => {
    renderVariants({ variants: [variant('B', 80), variant('C', 10)] });

    fireEvent.click(screen.getByRole('button', { name: 'Dividir igualmente' }));

    expect(controlePeso()).toHaveTextContent('34%');
    expect(screen.getByLabelText('Peso da variante B')).toHaveValue(33);
    expect(screen.getByLabelText('Peso da variante C')).toHaveValue(33);
  });

  it('soma diferente de 100 não chega ao save', () => {
    const onSaveVariants = vi.fn();
    renderVariants({ variants: [variant('B', 60), variant('C', 60)], onSaveVariants });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));

    expect(onSaveVariants).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('120%');
  });

  it('"Salvar variações" entrega o conjunto quando fecha 100%', () => {
    const onSaveVariants = vi.fn();
    renderVariants({ variants: [variant('B', 70)], onSaveVariants });

    fireEvent.change(screen.getByLabelText('Peso da variante B'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));

    expect(onSaveVariants).toHaveBeenCalledTimes(1);
    expect(onSaveVariants.mock.calls[0][0]).toMatchObject([{ id: 'var-B', label: 'B', weight: 30 }]);
  });
});

describe('X097 — colunas lado a lado', () => {
  it('mostra o controle (texto-base) e uma coluna por variante, com editor e prévia', () => {
    renderVariants({ variants: [variant('B', 40), variant('C', 40)] });

    expect(screen.getByTestId('talkx-variant-controle-conteudo')).toHaveTextContent('texto base do template');
    const colB = within(screen.getByTestId('talkx-variant-B'));
    expect(colB.getByDisplayValue('texto da variante B')).toBeInTheDocument();
    // a coluna C também tem o editor único do Talk X (toolbar com negrito)
    const colC = within(screen.getByTestId('talkx-variant-C'));
    expect(colC.getByRole('textbox')).toHaveValue('texto da variante C');
  });

  it('adiciona a variante C como cópia do texto-base e reparte os pesos', () => {
    renderVariants({ variants: [variant('B', 100)] });

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar variante C' }));

    const colC = within(screen.getByTestId('talkx-variant-C'));
    expect(colC.getByRole('textbox')).toHaveValue('texto base do template');
    expect(colC.getByLabelText('Peso da variante C')).toHaveValue(33);
    expect(controlePeso()).toHaveTextContent('34%');
  });
});

describe('X097 — resultado e vencedora', () => {
  it('o resultado de CAP-070 aparece por coluna; sem dado, "sem dados ainda"', () => {
    renderVariants({
      variants: [variant('B', 50), variant('C', 50)],
      results: [result('B', 240, 48)],
    });

    const colB = within(screen.getByTestId('talkx-variant-B'));
    expect(colB.getByText('240')).toBeInTheDocument();
    expect(colB.getByText('48')).toBeInTheDocument();
    expect(colB.getByText('20%')).toBeInTheDocument();
    expect(within(screen.getByTestId('talkx-variant-C')).getByText('sem dados ainda')).toBeInTheDocument();
  });

  it('"Declarar vencedora" fica bloqueada abaixo de 100 enviadas sem a marcação', () => {
    const onDeclareWinner = vi.fn();
    renderVariants({
      variants: [variant('B', 50), variant('C', 50)],
      results: [result('B', 40, 5), result('C', 150, 30)],
      onDeclareWinner,
    });

    const colB = within(screen.getByTestId('talkx-variant-B'));
    const colC = within(screen.getByTestId('talkx-variant-C'));
    const declararB = colB.getByRole('button', { name: 'Declarar vencedora' });

    expect(declararB).toBeDisabled();
    expect(colC.getByRole('button', { name: 'Declarar vencedora' })).toBeEnabled();

    // a marcação "sem base suficiente" é o que libera abaixo de 100
    fireEvent.click(colB.getByRole('checkbox'));
    expect(colB.getByRole('button', { name: 'Declarar vencedora' })).toBeEnabled();

    // a janela explica o efeito antes de confirmar
    fireEvent.click(colB.getByRole('button', { name: 'Declarar vencedora' }));
    expect(screen.getByText(/passa a ser o texto-base/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar vencedora' }));

    expect(onDeclareWinner).toHaveBeenCalledWith(expect.objectContaining({ id: 'var-B', label: 'B' }));
  });
});

describe('X097 — exclusão de variante', () => {
  it('remover variante com destinatários mostra a mensagem antes de excluir', async () => {
    const countRecipients = vi.fn().mockResolvedValue(3);
    const onRemoveVariant = vi.fn();
    renderVariants({ variants: [variant('B', 50)], countRecipients, onRemoveVariant });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir variante B' }));
    await flush();

    expect(countRecipients).toHaveBeenCalledWith('var-B');
    expect(screen.getByText(/usada em 3 envio\(s\)/)).toBeInTheDocument();
    expect(onRemoveVariant).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await flush();

    expect(onRemoveVariant).toHaveBeenCalledWith(expect.objectContaining({ id: 'var-B', label: 'B' }));
  });

  it('a confirmação do componente não chama window.confirm de novo no editor', async () => {
    fetchVariants.mockResolvedValue([variant('B', 50)]);
    countVariantRecipients.mockResolvedValue(3);

    renderEditor();
    await openVariants();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir variante B' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await flush();

    expect(window.confirm).not.toHaveBeenCalled();
    expect(deleteVariant).toHaveBeenCalledWith('var-B');
  });

  it('falha ao gravar o conjunto aparece na tela', async () => {
    const onSaveVariants = vi.fn().mockRejectedValue(new Error('talkx_template_not_authorized'));
    renderVariants({ variants: [variant('B', 50)], onSaveVariants });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));
    await flush();

    expect(screen.getByRole('alert')).toHaveTextContent('talkx_template_not_authorized');
  });

  it('variante em uso (talkx_variant_in_use) é avisada e a coluna continua na tela', async () => {
    const onRemoveVariant = vi.fn().mockRejectedValue(new Error('talkx_variant_in_use'));
    renderVariants({
      variants: [variant('B', 50)],
      countRecipients: vi.fn().mockResolvedValue(0),
      onRemoveVariant,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir variante B' }));
    await flush();

    expect(onRemoveVariant).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('talkx_variant_in_use');
    expect(screen.getByTestId('talkx-variant-B')).toBeInTheDocument();
  });

  it('sem destinatários, excluir não pede confirmação', async () => {
    const countRecipients = vi.fn().mockResolvedValue(0);
    const onRemoveVariant = vi.fn();
    renderVariants({ variants: [variant('B', 50)], countRecipients, onRemoveVariant });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir variante B' }));
    await flush();

    expect(onRemoveVariant).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Confirmar exclusão' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Integração com o editor: o conjunto sai por inteiro no botão e NADA é gravado
// no blur (aceite "grep saveVariant( no blur em EDT → 0").
// ---------------------------------------------------------------------------

const tplA = {
  id: 'tpl-A', name: 'Template A', description: null, category: 'geral', content: 'corpo do template A',
  media_url: null, media_type: null, tags: [], status: 'approved' as const, use_count: 0, created_by: null,
  custom_variables: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

function renderEditor() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TalkXTemplateEditor templates={[tplA as never]} isLoading={false} editing={tplA as never} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

const openVariants = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar variante' }));
  await flush();
};

describe('X097 — mídia da variante', () => {
  it('tipo de mídia sem URL não deixa Sem mídia ativo e salva como mídia nula', () => {
    const onSaveVariants = vi.fn();
    renderVariants({ variants: [variant('B', 50)], onSaveVariants });

    const imageButton = screen.getByRole('button', { name: 'Imagem' });
    fireEvent.click(imageButton);

    expect(screen.getByRole('button', { name: 'Sem mídia' })).toHaveAttribute('aria-pressed', 'false');
    expect(imageButton).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));

    expect(onSaveVariants).toHaveBeenCalledWith([expect.objectContaining({ media_url: null, media_type: null })]);
  });
});

describe('X097 — o editor só grava o conjunto pelo botão', () => {
  it('blur no conteúdo da variante não salva e soma diferente de 100 não chega à RPC', async () => {
    fetchVariants.mockResolvedValue([variant('B', 60), variant('C', 60)]);
    countVariantRecipients.mockResolvedValue(0);

    renderEditor();
    await openVariants();

    const colB = within(screen.getByTestId('talkx-variant-B'));
    fireEvent.blur(colB.getByRole('textbox'));
    await flush();
    expect(saveVariant).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));
    await flush();
    expect(saveVariant).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('talkx-variant-B')).getByRole('textbox')).toHaveValue('texto da variante B');
  });

  it('"Salvar variações" grava cada variante do conjunto no template ativo', async () => {
    fetchVariants.mockResolvedValue([variant('B', 60), variant('C', 40)]);
    countVariantRecipients.mockResolvedValue(0);

    renderEditor();
    await openVariants();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar variações' }));
    await flush();

    expect(saveVariant).toHaveBeenCalledTimes(2);
    expect(saveVariant).toHaveBeenCalledWith('tpl-A', expect.objectContaining({ id: 'var-B', label: 'B', weight: 60 }));
    expect(saveVariant).toHaveBeenCalledWith('tpl-A', expect.objectContaining({ id: 'var-C', label: 'C', weight: 40 }));
  });
});
