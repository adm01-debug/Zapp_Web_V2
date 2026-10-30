import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copiarTexto, avisarCopia, COPIADO, FALHA_COPIA } from '../clipboard';

/**
 * O defeito que este utilitário corrige: o padrão antigo
 * (`void navigator.clipboard.writeText(x); toast.success('Copiado!')`)
 * anunciava "Copiado!" mesmo quando a escrita falhava. Aqui provamos que
 * `copiarTexto` só confirma no sucesso e que `avisarCopia` nunca promete
 * cópia que não aconteceu.
 */

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

function definirClipboard(valor: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: valor, configurable: true, writable: true });
}

function definirExecCommand(fn: ((cmd: string) => boolean) | undefined) {
  Object.defineProperty(document, 'execCommand', { value: fn, configurable: true, writable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  definirExecCommand(undefined);
});

afterEach(() => {
  definirExecCommand(undefined);
});

describe('copiarTexto / avisarCopia', () => {
  it('sucesso: cópia confirmada resolve true e avisa "Copiado!"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    definirClipboard({ writeText });

    const ok = await copiarTexto('texto copiado');
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith('texto copiado');

    avisarCopia(ok);
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith(COPIADO);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('recusa: cópia falha resolve false e NUNCA mostra "Copiado!"', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    definirClipboard({ writeText });
    definirExecCommand(() => { throw new Error('execCommand indisponível'); });

    const ok = await copiarTexto('texto');
    expect(ok).toBe(false);

    avisarCopia(ok);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalledWith(FALHA_COPIA);
  });

  it('sem Clipboard API: cai no execCommand e confirma o sucesso por ele', async () => {
    definirClipboard(undefined);
    const exec = vi.fn().mockReturnValue(true);
    definirExecCommand(exec);

    const ok = await copiarTexto('texto');
    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('sem Clipboard API e execCommand recusando: false, sem "Copiado!"', async () => {
    definirClipboard(undefined);
    definirExecCommand(() => false);

    const ok = await copiarTexto('texto');
    expect(ok).toBe(false);

    avisarCopia(ok);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith(FALHA_COPIA);
  });
});
