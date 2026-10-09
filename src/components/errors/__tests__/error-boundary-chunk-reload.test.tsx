import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { lazy, Suspense, type ReactNode } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { ErrorBoundaryWithRetry } from '../../ui/error-boundary-retry';

// Mesmo motivo do ErrorBoundary.test.tsx: o boundary fala com o logger e com o
// reporter (audit_logs); o alvo aqui e quem recarrega a pagina, nao a telemetria.
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));

// Erro real que o navegador lanca quando o fetch do chunk da view falha
// (medido em t_96e6411d: "Failed to fetch dynamically imported module:
// .../EmailChatInbox.tsx").
const ERRO_DE_CHUNK = new TypeError(
  'Failed to fetch dynamically imported module: http://localhost:5173/src/components/email/EmailChatInbox.tsx',
);

// Instancia UNICA de lazy com a rejeicao ja guardada — e o que acontece no
// app: depois de falhar uma vez, o React.lazy re-lanca a MESMA rejeicao em
// cada remontagem, sem novo fetch. Por isso o retry da view nunca recupera.
const ViewLazyComChunkQuebrado = lazy(() => Promise.reject(ERRO_DE_CHUNK));

let falharComErroComum = true;
function ViewComErroComum() {
  if (falharComErroComum) throw new Error('falha qualquer');
  return <div>view carregada</div>;
}

// Mesma composicao de AppProviders (> ErrorBoundary global) + ViewRouter
// (> ErrorBoundaryView > ErrorBoundaryWithRetry > Suspense > lazy).
function ArvoreRealDaView({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ErrorBoundaryWithRetry moduleName="Email" maxAutoRetries={2}>
        <Suspense fallback={<div>carregando view</div>}>{children}</Suspense>
      </ErrorBoundaryWithRetry>
    </ErrorBoundary>
  );
}

describe('chunk error no caminho da view', () => {
  const reload = vi.fn();
  let locationOriginal: Location;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // jsdom nao deixa fazer spyOn em window.location.reload; troca a location
    // inteira por um objeto configuravel (dica medida no cartao).
    locationOriginal = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...locationOriginal, href: locationOriginal.href, reload },
    });
    sessionStorage.clear();
    reload.mockClear();
    falharComErroComum = true;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: locationOriginal,
    });
    consoleErrorSpy.mockRestore();
  });

  it('delega ao boundary global: exatamente 1 reload por sessao, sem laco', async () => {
    // 1a montagem: o boundary global detecta chunk error e recarrega uma vez.
    const primeira = render(
      <ArvoreRealDaView>
        <ViewLazyComChunkQuebrado />
      </ArvoreRealDaView>,
    );
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    // Quem responde e o fallback GLOBAL, nao o "Tentar novamente" da view
    // (que remontaria a mesma instancia lazy sem novo fetch).
    expect(await screen.findByText(/Ops! Algo deu errado/i)).toBeInTheDocument();
    expect(screen.queryByText(/Erro ao carregar Email/i)).toBeNull();
    primeira.unmount();

    // 2a e 3a montagens com o MESMO erro: a flag zapp_chunk_reload_v1 no
    // sessionStorage impede o laco de reload quando o chunk esta realmente ausente.
    for (let tentativa = 2; tentativa <= 3; tentativa += 1) {
      const { unmount } = render(
        <ArvoreRealDaView>
          <ViewLazyComChunkQuebrado />
        </ArvoreRealDaView>,
      );
      expect(await screen.findByText(/Ops! Algo deu errado/i)).toBeInTheDocument();
      expect(reload).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('erro comum continua no fluxo de retry da view, sem reload', async () => {
    render(
      <ArvoreRealDaView>
        <ViewComErroComum />
      </ArvoreRealDaView>,
    );

    // Apos as retentativas automaticas esgotarem (erro persiste), aparece o
    // "Tentar novamente" da view — a tela global de erro NAO pode assumir.
    const botao = await screen.findByRole('button', { name: /tentar novamente/i }, { timeout: 8000 });
    expect(screen.queryByText(/Ops! Algo deu errado/i)).toBeNull();
    expect(reload).not.toHaveBeenCalled();

    // Clique com o modulo recuperado: remonta e renderiza, ainda sem reload.
    falharComErroComum = false;
    fireEvent.click(botao);
    expect(await screen.findByText('view carregada')).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('Tentar novamente sobre fallback de chunk error recarrega a pagina limpando a flag', () => {
    // Cenario defensivo do cartao (item 2 da direcao): se o fallback da view
    // estiver na tela por causa de chunk error (a recarga unica da sessao ja
    // foi usada), o botao NAO pode remontar a instancia lazy — tem de recarregar
    // a pagina limpando a flag, igual ao handleReload do boundary global.
    // Pelo caminho de render real esse estado e inalcancavel (o re-lancamento
    // sempre delega ao global antes), entao o metodo real e exercido direto.
    sessionStorage.setItem('zapp_chunk_reload_v1', '1');

    const boundary = new ErrorBoundaryWithRetry({ maxAutoRetries: 0, children: null });
    boundary.state = {
      hasError: true,
      error: ERRO_DE_CHUNK,
      retryCount: 0,
      isAutoRetrying: false,
    };

    boundary.handleManualRetry();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('zapp_chunk_reload_v1')).toBeNull();
  });
});
