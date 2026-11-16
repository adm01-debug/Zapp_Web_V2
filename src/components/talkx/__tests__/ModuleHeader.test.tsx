import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Megaphone } from 'lucide-react';
import { ModuleHeader, ModuleBreadcrumb } from '../kit/primitives';

/**
 * X053 — cabeçalho do módulo: trilha correta para aba, wizard e campanha.
 */
describe('X053 · ModuleBreadcrumb', () => {
  it('renderiza a trilha com separadores', () => {
    render(<ModuleBreadcrumb items={['Talk X', 'Campanhas', 'Nova campanha']} />);
    expect(screen.getByText('Talk X')).toBeTruthy();
    expect(screen.getByText('Campanhas')).toBeTruthy();
    expect(screen.getByText('Nova campanha')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Trilha de navegação' });
    expect(nav).toBeTruthy();
  });

  it('não renderiza quando vazia', () => {
    const { container } = render(<ModuleBreadcrumb items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('destaca o último item com font-medium', () => {
    const { container } = render(<ModuleBreadcrumb items={['Talk X', 'Campanhas']} />);
    const spans = container.querySelectorAll('span:not([aria-hidden])');
    const last = spans[spans.length - 1];
    expect(last.className).toContain('font-medium');
  });
});

describe('X053 · ModuleHeader', () => {
  it('exibe título e trilha', () => {
    render(
      <ModuleHeader
        icon={Megaphone}
        title="Campanhas"
        subtitle="Gerencie suas campanhas"
        breadcrumb={['Talk X', 'Campanhas']}
      />
    );
    expect(screen.getByRole('navigation', { name: 'Trilha de navegação' })).toBeTruthy();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain('Campanhas');
  });

  it('não renderiza nav quando breadcrumb está ausente', () => {
    render(<ModuleHeader icon={Megaphone} title="Campanhas" />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('trilha correta para wizard: Talk X › Campanhas › Nova campanha', () => {
    render(<ModuleBreadcrumb items={['Talk X', 'Campanhas', 'Nova campanha']} />);
    const nav = screen.getByRole('navigation');
    expect(nav.textContent).toContain('Talk X');
    expect(nav.textContent).toContain('Nova campanha');
  });

  it('trilha correta para campanha com nome: Talk X › Campanhas › Black Friday', () => {
    render(<ModuleBreadcrumb items={['Talk X', 'Campanhas', 'Black Friday']} />);
    const nav = screen.getByRole('navigation');
    expect(nav.textContent).toContain('Black Friday');
  });
});
