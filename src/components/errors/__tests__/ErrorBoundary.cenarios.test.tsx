import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { resetChunkReloadGuard } from '@/lib/chunkReload';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));

const reload = vi.fn();

function Explode({ erro }: { erro: Error }): ReactElement {
  throw erro;
}

function montar(erro: Error) {
  return render(
    <ErrorBoundary>
      <Explode erro={erro} />
    </ErrorBoundary>
  );
}

describe('ErrorBoundary — fallback por cenario', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetChunkReloadGuard();
    reload.mockClear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { reload },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('chunk com orcamento disponivel: mostra a tela de recarga e dispara o reload', async () => {
    montar(new Error('Failed to fetch dynamically imported module: /assets/x.js'));

    expect(await screen.findByText(/Atualização disponível/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recarregar/i })).toBeInTheDocument();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('chunk com orcamento esgotado: mostra "Nova versão disponível" para o usuario agir', async () => {
    sessionStorage.setItem('__zapp_chunk_reload_count', '2');
    montar(new Error('Loading chunk 5 failed.'));

    expect(await screen.findByText(/Nova versão disponível/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atualizar agora/i })).toBeInTheDocument();
    // esgotado: nao recarrega sozinho por tras do usuario
    expect(reload).not.toHaveBeenCalled();
  });

  it('chunk sem sessionStorage na leitura: nao recarrega e mostra "Nova versão disponível"', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage bloqueado');
    });
    montar(new Error('Loading chunk 5 failed.'));

    expect(await screen.findByText(/Nova versão disponível/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atualizar agora/i })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('chunk sem sessionStorage na escrita: nao recarrega e mostra "Nova versão disponível"', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('storage bloqueado');
    });
    montar(new Error('Loading chunk 5 failed.'));

    expect(await screen.findByText(/Nova versão disponível/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atualizar agora/i })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('recursao infinita ganha mensagem propria (nao "tentar novamente")', async () => {
    montar(new RangeError('Maximum call stack size exceeded'));

    expect(await screen.findByText(/Tela em loop/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recarregar/i })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('erro comum segue no fallback generico', async () => {
    montar(new Error('falha qualquer de render'));

    expect(await screen.findByText(/Ops! Algo deu errado/i)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('fallback explicito continua vencendo os cenarios', async () => {
    render(
      <ErrorBoundary fallback={<div>fallback proprio</div>}>
        <Explode erro={new Error('Failed to fetch dynamically imported module: /assets/x.js')} />
      </ErrorBoundary>
    );
    expect(await screen.findByText('fallback proprio')).toBeInTheDocument();
  });
});
