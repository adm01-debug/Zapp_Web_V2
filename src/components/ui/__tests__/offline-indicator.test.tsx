/**
 * UK-14 — contrato de `offline-indicator`.
 *
 * Prova o indicador real de conexão: nada com a rede no ar; aviso com a rede
 * caída; some ao voltar o evento `online`; o "Tentar novamente" chama o
 * `fetch('/favicon.ico')` e mostra "Reconectando...", fechando ao resolver e
 * voltando ao aviso ao rejeitar. E o toast "Conexão restaurada" do
 * `useOfflineStatus`, que fica 3 s (timeout) depois de reconectar.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

import { OfflineIndicator, ConnectionToast } from '@/components/ui/offline-indicator';

let online = true;
let fetchMock: ReturnType<typeof vi.fn>;

function definirOnline(valor: boolean) {
  online = valor;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
}

beforeEach(() => {
  definirOnline(true);
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cleanup();
});

describe('offline-indicator — contrato (UK-14)', () => {
  it('com a rede no ar não renderiza nada', () => {
    definirOnline(true);
    render(<OfflineIndicator />);

    expect(screen.queryByText('Você está offline')).toBeNull();
  });

  it('com a rede caída mostra o aviso e o botão de tentar novamente', () => {
    definirOnline(false);
    render(<OfflineIndicator />);

    expect(screen.getByText('Você está offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('o evento "online" faz o aviso sumir', async () => {
    definirOnline(false);
    render(<OfflineIndicator />);
    expect(screen.getByText('Você está offline')).toBeInTheDocument();

    act(() => {
      definirOnline(true);
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(screen.queryByText('Você está offline')).toBeNull());
  });

  it('"Tentar novamente" sonda /favicon.ico, mostra "Reconectando..." e fecha ao resolver', async () => {
    definirOnline(false);
    let resolver: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => { resolver = r; }));
    render(<OfflineIndicator />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(fetchMock).toHaveBeenCalledWith('/favicon.ico', expect.objectContaining({ method: 'HEAD' }));
    expect(screen.getByText('Reconectando...')).toBeInTheDocument();

    await act(async () => {
      resolver({ ok: true });
    });

    await waitFor(() => expect(screen.queryByText('Reconectando...')).toBeNull());
    expect(screen.queryByText('Você está offline')).toBeNull();
  });

  it('se a sonda falhar, volta ao aviso offline', async () => {
    definirOnline(false);
    fetchMock.mockRejectedValue(new Error('sem rede'));
    render(<OfflineIndicator />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.getByText('Você está offline')).toBeInTheDocument());
    expect(screen.queryByText('Reconectando...')).toBeNull();
  });

  it.fails(
    'o botão "Tentar novamente" tem type="button" (não envia formulário) — falta em offline-indicator.tsx:69',
    () => {
      definirOnline(false);
      render(<OfflineIndicator />);

      expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveAttribute('type', 'button');
    },
  );
});

describe('ConnectionToast — contrato (UK-14)', () => {
  it('aparece ao reconectar e desaparece após 3 s (timeout do useOfflineStatus)', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    definirOnline(false);
    render(<ConnectionToast />);
    expect(screen.queryByText('Conexão restaurada')).toBeNull();

    act(() => {
      definirOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByText('Conexão restaurada')).toBeInTheDocument();

    // O atraso do toast é exatamente 3 s (setTimeout do useOfflineStatus).
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3000);

    // E o nó sai de fato depois disso (a saída do AnimatePresence roda de verdade
    // aqui, com timers reais: por isso a espera de até 5 s).
    await waitFor(() => expect(screen.queryByText('Conexão restaurada')).toBeNull(), { timeout: 5000 });
    setTimeoutSpy.mockRestore();
  });

  it('não aparece já conectado (só depois de uma queda)', () => {
    definirOnline(true);
    render(<ConnectionToast />);

    expect(screen.queryByText('Conexão restaurada')).toBeNull();
  });
});
