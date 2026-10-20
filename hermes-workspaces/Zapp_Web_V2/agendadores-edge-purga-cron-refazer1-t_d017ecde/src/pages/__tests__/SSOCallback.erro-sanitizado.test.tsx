/**
 * Polimento das telas de auth (t_051c55b9).
 *
 * A mensagem de erro do SSO chega pela URL (`error_description`/`error`), ou
 * seja, o texto é escolhido por quem monta o link. Antes era exibida crua.
 * Agora é cortada em 200 caracteres, tem os caracteres de marcação removidos e
 * cai num texto genérico quando não sobra nada — provado renderizando a TELA
 * real com a query suja, sem exportar helper.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SSOCallback from '../SSOCallback';

function renderComErroNaUrl(raw: string) {
  window.history.replaceState(
    {},
    '',
    '/sso-callback?error_description=' + encodeURIComponent(raw),
  );
  return render(
    <MemoryRouter initialEntries={['/sso-callback']}>
      <SSOCallback />
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('SSOCallback — erro da URL exibido como texto (t_051c55b9)', () => {
  it('exibe a mensagem sem os caracteres de marcação', () => {
    renderComErroNaUrl('<b>credenciais inválidas</b>');

    const texto = screen.getByText(/credenciais inválidas/);
    expect(texto.textContent).not.toMatch(/[<>]/);
    expect(texto.textContent).toContain('credenciais inválidas');
  });

  it('limita a mensagem a 200 caracteres na tela', () => {
    renderComErroNaUrl('a'.repeat(500));

    const texto = screen.getByText(/^a+$/);
    expect(texto.textContent).toHaveLength(200);
  });

  it('cai no texto genérico quando a URL só traz marcação', () => {
    renderComErroNaUrl('<>"\'&`');

    expect(screen.getByText('Ocorreu um erro durante a autenticação')).toBeTruthy();
  });
});
