import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuoteDraftCard } from '../QuoteDraftCard';
import type { QuoteDraft } from '@/hooks/copilot/useQuoteDraft';

/**
 * B8: o botão "Copiar texto" do rascunho de proposta só pode virar "copiado"
 * (ícone de check) quando a escrita na área de transferência é confirmada.
 * Na falha, avisa o erro e o ícone continua o de copiar.
 */

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

function definirClipboard(valor: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: valor, configurable: true, writable: true });
}

function definirExecCommand(fn: ((cmd: string) => boolean) | undefined) {
  Object.defineProperty(document, 'execCommand', { value: fn, configurable: true, writable: true });
}

const draft: QuoteDraft = {
  ready: true,
  clientName: 'Cliente',
  items: [{ description: 'Caneta', quantity: 10, unitPrice: 2, total: 20 }],
  totalValue: 20,
  validity: 7,
  paymentTerms: 'à vista',
  deliveryDate: '10/12',
  observations: [],
  textSummary: 'Proposta: 10 canetas — R$ 20,00',
};

function botaoCopiar() {
  return screen.getByTitle('Copiar texto');
}

describe('QuoteDraftCard — cópia só confirma no sucesso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    definirExecCommand(undefined);
  });

  it('sucesso: copia o resumo, avisa "Copiado!" e mostra o check', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    definirClipboard({ writeText });
    render(<QuoteDraftCard draft={draft} />);

    fireEvent.click(botaoCopiar());

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Copiado!'));
    expect(writeText).toHaveBeenCalledWith(draft.textSummary);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(botaoCopiar().querySelector('.lucide-check')).not.toBeNull();
  });

  it('recusa: avisa o erro e o ícone continua o de copiar (nunca o check)', async () => {
    definirClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    definirExecCommand(() => { throw new Error('execCommand indisponível'); });
    render(<QuoteDraftCard draft={draft} />);

    fireEvent.click(botaoCopiar());

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(botaoCopiar().querySelector('.lucide-check')).toBeNull();
    expect(botaoCopiar().querySelector('.lucide-copy')).not.toBeNull();
  });
});
