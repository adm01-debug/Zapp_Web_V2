import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIResponseCard } from '../AIResponseCard';

/**
 * Ponto 1 do cartão: não anunciar "Copiado!" sem confirmação. Aqui a prova é
 * no ponto de uso — com a escrita recusada, o cartão mostra o erro e o botão
 * continua "Copiar" (nunca vira "Copiado").
 */

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

function definirClipboard(valor: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: valor, configurable: true, writable: true });
}

function definirExecCommand(fn: ((cmd: string) => boolean) | undefined) {
  Object.defineProperty(document, 'execCommand', { value: fn, configurable: true, writable: true });
}

describe('AIResponseCard — cópia só confirma no sucesso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    definirExecCommand(undefined);
  });

  it('sucesso: mostra "Copiado!" e o botão vira "Copiado"', async () => {
    definirClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    render(<AIResponseCard response="Resposta sugerida" />);

    fireEvent.click(screen.getByRole('button', { name: /copiar/i }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Copiado!'));
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /copiado/i })).toBeInTheDocument();
  });

  it('recusa: mostra o erro e o botão continua "Copiar"', async () => {
    definirClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    definirExecCommand(() => { throw new Error('execCommand indisponível'); });
    render(<AIResponseCard response="Resposta sugerida" />);

    fireEvent.click(screen.getByRole('button', { name: /copiar/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.success).not.toHaveBeenCalled();
    // o texto é "Copiar" (ícone Copy), nunca "Copiado"
    expect(screen.getByRole('button', { name: /^copiar$/i })).toBeInTheDocument();
  });
});
