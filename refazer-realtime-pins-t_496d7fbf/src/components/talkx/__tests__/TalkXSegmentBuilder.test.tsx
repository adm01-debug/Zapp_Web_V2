import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// X099 — o construtor de segmentos como componente próprio: ← com alteração
// pendente pergunta antes de sair, ↶ ↷ (e Ctrl+Z) desfazem de verdade, "Limpar
// tudo" volta e o nome repetido barra o publicar.
//
// Vermelho antes do fix: a função interna `SegmentBuilder` de TalkXSegments.tsx
// não tinha desfazer nenhum, o X saía do construtor descartando a edição sem
// aviso e não havia validação de nome/descrição.

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.not = () => chain;
  chain.or = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.eq = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return {
    supabase: {
      from: () => chain,
      rpc: (_name: string, args?: { p_mode?: string }) => Promise.resolve({
        data: args?.p_mode === 'page'
          ? { mode: 'page', rows: [], has_more: false, next_after: null }
          : { mode: 'count', matched: 42, eligible: 42, suppressed: 0, invalid_phone: 0, legacy_or_deleted: 0 },
        error: null,
      }),
    },
  };
});

import { toast } from 'sonner';
import { TalkXSegmentBuilder } from '../segments/TalkXSegmentBuilder';
import { SEGMENT_DESCRIPTION_MAX } from '../segments/segmentValidation';
import type { SegmentBuilderContent } from '../segments/segmentBuilderReducer';

const rascunho = (over: Partial<SegmentBuilderContent> = {}): SegmentBuilderContent => ({
  name: 'Segmento X',
  description: '',
  rules: { groups: [{ id: 'g1', match: 'and', rules: [{ id: 'r1', field: 'tags', op: 'contains', value: 'VIP' }] }] },
  ...over,
});

function renderBuilder({
  initial = rascunho(),
  existingNames = ['Outro segmento'],
  onSave = vi.fn(),
  onCancel = vi.fn(),
}: { initial?: SegmentBuilderContent; existingNames?: string[]; onSave?: (d: SegmentBuilderContent) => void; onCancel?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TalkXSegmentBuilder initial={initial} isNew={false} saving={false} existingNames={existingNames} onSave={onSave} onCancel={onCancel} />
    </QueryClientProvider>,
  );
  return { onSave, onCancel };
}

const campoNome = () => screen.getByPlaceholderText('Nome do segmento…') as HTMLInputElement;

describe('TalkXSegmentBuilder · sair com alteração pendente (X099)', () => {
  beforeEach(() => { vi.mocked(toast.error).mockClear(); });

  it('voltar sem alteração sai direto, sem diálogo', () => {
    const { onCancel } = renderBuilder();

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Alterações não salvas')).toBeNull();
  });

  it('voltar com alteração pendente pergunta antes de sair', async () => {
    const { onSave, onCancel } = renderBuilder();
    fireEvent.change(campoNome(), { target: { value: 'Segmento XY' } });

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(await screen.findByText('Alterações não salvas')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();

    // "Continuar editando" fecha o aviso e mantém o construtor aberto.
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    await waitFor(() => expect(screen.queryByText('Alterações não salvas')).toBeNull());
    expect(onCancel).not.toHaveBeenCalled();
    expect(campoNome().value).toBe('Segmento XY');

    // "Descartar" sai sem salvar.
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await screen.findByText('Alterações não salvas');
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('salvar e sair entrega o rascunho alterado', async () => {
    const { onSave, onCancel } = renderBuilder();
    fireEvent.change(campoNome(), { target: { value: 'Segmento XY' } });

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await screen.findByText('Alterações não salvas');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e sair' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Segmento XY' }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('TalkXSegmentBuilder · desfazer/refazer (X099)', () => {
  it('os botões ↶ ↷ voltam e refazem a edição', () => {
    renderBuilder();
    const desfazer = screen.getByRole('button', { name: 'Desfazer' });
    const refazer = screen.getByRole('button', { name: 'Refazer' });
    expect((desfazer as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(campoNome(), { target: { value: 'Segmento XY' } });
    expect(campoNome().value).toBe('Segmento XY');

    fireEvent.click(desfazer);
    expect(campoNome().value).toBe('Segmento X');
    expect((refazer as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(refazer);
    expect(campoNome().value).toBe('Segmento XY');
  });

  it('Ctrl+Z desfaz a edição', () => {
    renderBuilder();
    fireEvent.change(campoNome(), { target: { value: 'Segmento XYZ' } });

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    expect(campoNome().value).toBe('Segmento X');
  });

  it('"Limpar tudo" volta com Desfazer', async () => {
    renderBuilder();
    expect(screen.getByDisplayValue('VIP')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Limpar tudo/ }));
    await waitFor(() => expect(screen.queryByDisplayValue('VIP')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(screen.getByDisplayValue('VIP')).toBeInTheDocument();
  });

  it('duplicar grupo copia as condições', () => {
    renderBuilder();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar grupo' }));

    expect(screen.getAllByDisplayValue('VIP')).toHaveLength(2);
  });
});

describe('TalkXSegmentBuilder · validação antes de publicar (X099)', () => {
  beforeEach(() => { vi.mocked(toast.error).mockClear(); });

  it('nome repetido na biblioteca barra o salvar', () => {
    const { onSave } = renderBuilder({ existingNames: ['Segmento X'] });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(toast.error).toHaveBeenCalledWith('Já existe um segmento com este nome.');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Já existe um segmento com este nome.');
  });

  it('descrição acima do limite barra o salvar e o contador mostra o tamanho', () => {
    const { onSave } = renderBuilder();
    fireEvent.change(screen.getByPlaceholderText(/Adicione uma descrição/), { target: { value: 'a'.repeat(SEGMENT_DESCRIPTION_MAX + 1) } });

    expect(screen.getByText(`${SEGMENT_DESCRIPTION_MAX + 1}/${SEGMENT_DESCRIPTION_MAX}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('no máximo 160'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rascunho válido é entregue a onSave', () => {
    const { onSave } = renderBuilder();
    fireEvent.change(campoNome(), { target: { value: 'Segmento VIP' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Segmento VIP' }));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
