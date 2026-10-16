import { readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * t_5b60e125 — o estado vazio do app passa a ter UM só módulo.
 * Este teste prende as duas coisas: o comportamento do canônico
 * (ação, tamanhos e aria) e o fato de não haver mais código morto
 * de empty state em src/components/ui.
 */

const base = {
  icon: Inbox,
  title: 'Nenhuma conversa ainda',
  description: 'Quando seus clientes enviarem mensagens, elas aparecerão aqui.',
};

describe('EmptyState (canônico)', () => {
  it('é o único módulo de estado vazio em src/components/ui', () => {
    const arquivos = readdirSync('src/components/ui')
      .filter((nome) => /^empty-?states?\.tsx$/i.test(nome))
      .sort();

    expect(arquivos).toEqual(['empty-state.tsx']);
  });

  it('mostra o título como cabeçalho e a descrição', () => {
    render(<EmptyState {...base} />);

    expect(screen.getByRole('heading', { level: 3, name: base.title })).not.toBeNull();
    expect(screen.getByText(base.description)).not.toBeNull();
  });

  it('esconde o ícone decorativo e a ilustração dos leitores de tela', () => {
    const { container } = render(<EmptyState {...base} />);

    // O aria-hidden vive no CONTAINER do ícone dentro do empty-state.tsx
    // (não basta o svg do lucide trazer aria-hidden próprio).
    const icone = container.querySelector('[data-testid="empty-state-icon"]');
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
    // O nome acessível vem do texto, não do enfeite: o svg está dentro do container escondido.
    expect(icone?.querySelector('svg')).not.toBeNull();

    const comIlustracao = render(<EmptyState {...base} illustration="inbox" />).container;
    const ilustracao = comIlustracao.querySelector('[data-testid="empty-state-illustration"]');
    expect(ilustracao?.getAttribute('aria-hidden')).toBe('true');
  });

  it('dispara a ação primária e a secundária, com nome acessível', () => {
    const onAction = vi.fn();
    const onSecondaryAction = vi.fn();

    render(
      <EmptyState
        {...base}
        actionLabel="Conectar WhatsApp"
        onAction={onAction}
        secondaryActionLabel="Ver como funciona"
        onSecondaryAction={onSecondaryAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Conectar WhatsApp/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver como funciona' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
  });

  it('não oferece ação sem rótulo ou sem handler', () => {
    render(<EmptyState {...base} actionLabel="Conectar WhatsApp" onSecondaryAction={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('aplica o tamanho pedido no container', () => {
    const sm = render(<EmptyState {...base} size="sm" />).container;
    const md = render(<EmptyState {...base} />).container;
    const lg = render(<EmptyState {...base} size="lg" />).container;

    expect(sm.firstElementChild?.className).toContain('py-6');
    expect(md.firstElementChild?.className).toContain('py-10');
    expect(lg.firstElementChild?.className).toContain('py-16');
  });

  it('mostra o texto de apoio quando ele existe', () => {
    render(<EmptyState {...base} helpText="Como funciona: conecte o WhatsApp." />);

    expect(screen.getByText('Como funciona: conecte o WhatsApp.')).not.toBeNull();
  });
});
