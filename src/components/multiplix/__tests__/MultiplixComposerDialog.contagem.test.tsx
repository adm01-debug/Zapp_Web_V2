/**
 * F78 / TL-010 — Multiplix: a conta "N contatos × M blocos = N×M mensagens" tem
 * de ficar SEMPRE visível no composer, e o título deixa de ser obrigatório ("dá
 * para enviar sem nomear").
 *
 * A lacuna do inventário (F78) dizia: "Draft antigo exige nome e template;
 * N×M/auto-save e composição persistida outra máquina não existem". O que este
 * teste prova, contra o componente REAL (`MultiplixComposerDialog`):
 *  1. a conta aparece com a seleção e acompanha a composição (0 bloco -> 0
 *     mensagens; 1 bloco -> N×1 mensagens);
 *  2. sem nome digitado o disparo SAI com o título sugerido (público + assunto)
 *     — o `mutateAsync` recebe o nome sugerido, não string vazia (a edge
 *     `multiplix-audience` exige `name` min(1): CreateDraftParamsSchema);
 *  3. o nome digitado continua mandando (a sugestão é editável);
 *  4. sem mensagem o envio continua bloqueado (o bloco de texto não foi
 *     dispensado).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/integrations/useMultiplixAudience', () => ({
  MultiplixOverLimitError: class MultiplixOverLimitError extends Error {},
}));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useCreateMultiplixDispatch: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));

import { MultiplixComposerDialog } from '@/components/multiplix/MultiplixComposerDialog';

const MENSAGEM_PLACEHOLDER = 'Olá {{empresa}}, {{saudacao}}!';

function renderComposer(companyIds: string[]) {
  return render(
    <MultiplixComposerDialog
      open
      onOpenChange={vi.fn()}
      selectedCompanyIds={companyIds}
      onCreated={vi.fn()}
    />,
  );
}

function escreverMensagem(valor: string) {
  fireEvent.change(screen.getByPlaceholderText(MENSAGEM_PLACEHOLDER), { target: { value: valor } });
}

beforeEach(() => {
  h.mutateAsync.mockReset();
  h.mutateAsync.mockResolvedValue({ id: 'd1', recipientCount: 3, created: true });
});

describe('MultiplixComposerDialog — conta N×M e título opcional (F78/TL-010)', () => {
  it('mostra a conta sempre visível e acompanha a composição', () => {
    renderComposer(['c1', 'c2', 'c3']);

    const conta = screen.getByTestId('multiplix-contagem-mensagens');
    // Sem composição ainda: 3 contatos × 0 blocos = 0 mensagens.
    expect(conta).toHaveTextContent('3 contatos × 0 blocos = 0 mensagens');

    escreverMensagem('Convite feira 2026');

    // Com o bloco de texto preenchido: 3 contatos × 1 bloco = 3 mensagens.
    expect(conta).toHaveTextContent('3 contatos × 1 bloco = 3 mensagens');
  });

  it('envia SEM nomear: o disparo sai com o título sugerido (público + assunto)', async () => {
    renderComposer(['c1', 'c2', 'c3']);

    escreverMensagem('Convite feira 2026\nSegunda linha do corpo');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      name: 'Multiplix · 3 contatos · Convite feira 2026',
      messageTemplate: 'Convite feira 2026\nSegunda linha do corpo',
      companyIds: ['c1', 'c2', 'c3'],
      startNow: false,
    });
  });

  it('usa o título digitado quando existe (a sugestão é editável)', async () => {
    renderComposer(['c1', 'c2']);

    fireEvent.change(screen.getByPlaceholderText('Ex.: Convite feira 2026'), { target: { value: 'Feira 2027' } });
    escreverMensagem('Olá!');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({
      name: 'Feira 2027',
      companyIds: ['c1', 'c2'],
    });
  });

  it('mantém o envio bloqueado sem mensagem (o bloco de texto continua exigido)', () => {
    renderComposer(['c1']);

    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvar e iniciar agora' })).toBeDisabled();
  });
});
