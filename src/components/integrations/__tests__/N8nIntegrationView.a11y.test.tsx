/**
 * N-195 (atualizado) — a tela do n8n virou placeholder declarado: sem servidor
 * n8n, webhook real, persistência ou validação de URL, ela não oferece conectar
 * nem testar e declara explicitamente que a integração não está disponível
 * (decisão documentada no cabeçalho de N8nIntegrationView.tsx e travada pelo
 * ACTIVE_REGRESSION N8nIntegrationView.test.tsx: zero botões na tela).
 *
 * A prova de acessibilidade acompanha a decisão: a tela anuncia o título e a
 * indisponibilidade, não expõe nenhum controle sem nome acessível (na prática,
 * nenhum botão/switch) e o axe não aponta violações de nome acessível
 * (button-name, aria-toggle-field-name).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  },
}));

import { N8nIntegrationView } from '../N8nIntegrationView';

describe('a11y: N8nIntegrationView — placeholder sem controles sem nome (N-195)', () => {
  it('anuncia o título e a indisponibilidade da integração', () => {
    render(<N8nIntegrationView />);

    expect(screen.getByRole('heading', { name: 'Integração n8n' })).toBeInTheDocument();
    expect(screen.getByText('Integração não disponível nesta versão')).toBeInTheDocument();
  });

  it('não expõe botão nem switch sem nome acessível', () => {
    render(<N8nIntegrationView />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });

  it('axe não acusa controles sem nome (button-name, aria-toggle-field-name)', async () => {
    const { baseElement } = render(<N8nIntegrationView />);

    const results = await axe(baseElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['button-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });
});
