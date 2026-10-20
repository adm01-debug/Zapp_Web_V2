import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarEmpty } from '../SidebarEmpty';

describe('SidebarEmpty (etapa 47)', () => {
  it('renderiza ícone em círculo e a frase', () => {
    const { container } = render(<SidebarEmpty cause="not-found" message="Contato não vinculado ao Singu" />);
    expect(screen.getByTestId('sidebar-empty-not-found')).toBeInTheDocument();
    expect(screen.getByText('Contato não vinculado ao Singu')).toBeInTheDocument();
    expect(container.querySelector('.w-10.h-10.rounded-full')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('com CTA renderiza Button outline sm que dispara onClick', () => {
    const onClick = vi.fn();
    render(<SidebarEmpty cause="error" message="Não foi possível carregar" cta={{ label: 'Tentar de novo', onClick }} />);
    const btn = screen.getByRole('button', { name: 'Tentar de novo' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
