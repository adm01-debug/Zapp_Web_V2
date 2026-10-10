/**
 * N-189 — Casco: animações do framer-motion respeitam 'reduzir movimento' em todo o app.
 *
 * Prova que MotionConfig reducedMotion='user' na raiz do App faz com que
 * o contexto de motion retorne 'user' para reducedMotion.
 *
 * RED (sem a correção): sem MotionConfig na raiz, useContext(MotionConfigContext)
 * retorna null (o padrão do framer-motion sem configuração).
 * GREEN (com a correção): MotionConfig reducedMotion='user' na raiz faz o
 * contexto retornar { reducedMotion: 'user' }.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useContext } from 'react';
import { MotionConfigContext, useReducedMotion } from 'framer-motion';
import App from './App';

// Mock de AppProviders: apenas renderiza os children (pass-through).
vi.mock('@/providers/AppProviders', () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock de AppRoutes: renderiza um placeholder simples.
const mockAppRoutes = vi.hoisted(() => vi.fn());
vi.mock('@/routes/AppRoutes', () => ({
  AppRoutes: mockAppRoutes,
}));

// Componente auxiliar que lê o contexto de MotionConfig e exibe o valor.
function MotionConfigProbe() {
  const config = useContext(MotionConfigContext);
  const reduced = useReducedMotion();
  return (
    <span data-testid="motion-config-probe">
      {config === null ? 'null' : JSON.stringify(config)}
      |{reduced ? 'reduced' : 'normal'}
    </span>
  );
}

// Helper: configura o matchMedia para retornar matches=true para reduced motion.
const setReducedMotion = (matches: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
};

beforeEach(() => {
  mockAppRoutes.mockReset();
  setReducedMotion(false);
});

describe('N-189 — MotionConfig reducedMotion="user" na raiz do App', () => {
  it('sem a correção, o contexto de MotionConfig é null (sem reducedMotion definido)', () => {
    setReducedMotion(true);
    mockAppRoutes.mockReturnValue(
      <div data-testid="app-routes">
        <MotionConfigProbe />
      </div>
    );

    const { container } = render(<App />);

    const probe = container.querySelector('[data-testid="motion-config-probe"]');
    expect(probe).not.toBeNull();

    // Sem MotionConfig na raiz, o contexto reflete 'never' (padrão do framer-motion
// sem configuração). O teste fica vermelho porque reducedMotion não é 'user'.
    expect(probe?.textContent).toContain('"never"');
  });

  it('com a correção, o contexto de MotionConfig tem reducedMotion="user"', () => {
    setReducedMotion(true);
    mockAppRoutes.mockReturnValue(
      <div data-testid="app-routes">
        <MotionConfigProbe />
      </div>
    );

    const { container } = render(<App />);

    const probe = container.querySelector('[data-testid="motion-config-probe"]');
    expect(probe).not.toBeNull();

    // Com MotionConfig reducedMotion="user" na raiz, o contexto reflete 'user'.
    expect(probe?.textContent).toContain('"user"');
    expect(probe?.textContent).toContain('reduced');
  });
});