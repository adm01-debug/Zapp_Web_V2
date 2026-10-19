import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { log } from '@/lib/logger';
import { resetChunkReloadGuard } from '@/lib/chunkReload';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));

const reload = vi.fn();

function Explode({ erro }: { erro: Error }): ReactElement {
  throw erro;
}

function montarChunk() {
  return render(
    <ErrorBoundary>
      <Explode erro={new Error('Loading chunk 5 failed.')} />
    </ErrorBoundary>
  );
}

/** O que o boundary registrou em log.warn (primeiro argumento de cada chamada). */
function avisoDoBoundary(): string {
  return vi
    .mocked(log.warn)
    .mock.calls.map((chamada) => String(chamada[0]))
    .join(' | ');
}

/**
 * O ramo `false` de triggerChunkReload cobre duas situacoes diferentes e o log
 * tem de dizer qual delas aconteceu: orcamento esgotado (tela "Nova versao
 * disponivel") x cooldown de 30 s / recarga ja disparada (tela "Atualizacao
 * disponivel"). Sem isso o aviso fala de orcamento esgotado quando o usuario
 * esta vendo outra tela.
 */
describe('ErrorBoundary — o aviso de chunk diz qual tela o usuario esta vendo', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetChunkReloadGuard();
    vi.mocked(log.warn).mockClear();
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

  it('orcamento esgotado: aviso cita o orcamento e nao cita cooldown', async () => {
    sessionStorage.setItem('__zapp_chunk_reload_count', '2');

    montarChunk();

    expect(await screen.findByText(/Nova versão disponível/i)).toBeInTheDocument();
    expect(avisoDoBoundary()).toMatch(/esgotado/i);
    expect(avisoDoBoundary()).not.toMatch(/cooldown/i);
    expect(reload).not.toHaveBeenCalled();
  });

  it('cooldown ativo: aviso cita o cooldown e nao cita orcamento esgotado', async () => {
    sessionStorage.setItem('__zapp_chunk_reload_at', String(Date.now()));

    montarChunk();

    expect(await screen.findByText(/Atualização disponível/i)).toBeInTheDocument();
    expect(avisoDoBoundary()).toMatch(/cooldown/i);
    expect(avisoDoBoundary()).not.toMatch(/esgotado/i);
    expect(reload).not.toHaveBeenCalled();
  });

  it('as duas situacoes nao saem com o mesmo aviso', async () => {
    sessionStorage.setItem('__zapp_chunk_reload_count', '2');
    const comOrcamentoEsgotado = montarChunk();
    await screen.findByText(/Nova versão disponível/i);
    const avisoEsgotado = avisoDoBoundary();
    comOrcamentoEsgotado.unmount();

    vi.mocked(log.warn).mockClear();
    sessionStorage.clear();
    resetChunkReloadGuard();
    sessionStorage.setItem('__zapp_chunk_reload_at', String(Date.now()));
    montarChunk();
    await screen.findByText(/Atualização disponível/i);
    const avisoCooldown = avisoDoBoundary();

    expect(avisoEsgotado).not.toBe('');
    expect(avisoCooldown).not.toBe('');
    expect(avisoEsgotado).not.toBe(avisoCooldown);
  });
});
