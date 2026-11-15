/**
 * CV-051..060 — o painel RADAR é opcional: se ele falhar, a conversa continua.
 * O fallback é nada (sem cartão de erro), porque o atendente não pediu o painel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RadarBoundary } from '../RadarBoundary';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function Explode(): never {
  throw new Error('useAuth must be used within an AuthProvider');
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // React registra o erro capturado no console; silenciado para o relatório do
  // teste não parecer falha.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('RadarBoundary', () => {
  it('deixa o painel passar quando não há erro', () => {
    render(
      <RadarBoundary>
        <div>painel do radar</div>
      </RadarBoundary>,
    );

    expect(screen.getByText('painel do radar')).toBeInTheDocument();
  });

  it('engole o erro do painel e não renderiza nada no lugar', async () => {
    const { container } = render(
      <RadarBoundary>
        <Explode />
      </RadarBoundary>,
    );

    expect(container).toBeEmptyDOMElement();

    const { log } = await import('@/lib/logger');
    expect(log.error).toHaveBeenCalled();
  });

  it('não desenha cartão de erro nem botão de tentar de novo', () => {
    render(
      <RadarBoundary>
        <Explode />
      </RadarBoundary>,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/erro/i)).toBeNull();
  });
});
