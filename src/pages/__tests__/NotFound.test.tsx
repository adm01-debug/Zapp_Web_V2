/**
 * Testes de `src/pages/NotFound.tsx` — a tela 404 servida pela rota curinga
 * (`path="*"` em `src/routes/AppRoutes.tsx`).
 *
 * A tela REAL é montada dentro de um MemoryRouter; a única fronteira dublada é o
 * logger. Trava: o caminho inexistente aparece para o usuário e vai para o log,
 * "Início" leva de volta para `/` e "Voltar" usa o histórico do navegador.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  log: { error: h.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import NotFound from '../NotFound';

function cenario(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/" element={<p>tela inicial</p>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NotFound (rota curinga)', () => {
  beforeEach(() => {
    h.logError.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mostra o 404 com o caminho inexistente e registra no log', () => {
    cenario('/rota/que-nao-existe');

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByText('/rota/que-nao-existe').tagName).toBe('CODE');
    expect(h.logError).toHaveBeenCalledWith(
      '404 Error: User attempted to access non-existent route:',
      '/rota/que-nao-existe',
    );
  });

  it('"Início" é um link para / e leva de volta à tela inicial', () => {
    cenario('/sumiu');

    const inicio = screen.getByRole('link', { name: /Início/ });
    expect(inicio).toHaveAttribute('href', '/');

    fireEvent.click(inicio);

    expect(screen.getByText('tela inicial')).toBeInTheDocument();
    expect(screen.queryByText('Página não encontrada')).not.toBeInTheDocument();
  });

  it('"Voltar" volta uma página no histórico do navegador', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    cenario('/sumiu');

    fireEvent.click(screen.getByRole('button', { name: /Voltar/ }));

    expect(back).toHaveBeenCalledTimes(1);
  });
});
