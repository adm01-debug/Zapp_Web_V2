import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Mail } from 'lucide-react';
import { SidebarRow } from '../SidebarRow';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('SidebarRow (etapa 46)', () => {
  it('botão copiar chama navigator.clipboard.writeText e tem aria-label', async () => {
    render(<SidebarRow icon={<Mail />} label="E-mail" field="email" value="a@b.com" copyable />);
    const btn = screen.getByRole('button', { name: 'Copiar E-mail' });
    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('a@b.com'));
  });

  it('external renderiza <a target=_blank rel=noopener> só com URL segura', () => {
    const { rerender } = render(<SidebarRow icon={<Mail />} label="Site" field="site" value="site.com" href="https://exemplo.com/p" />);
    const link = screen.getByRole('link', { name: 'Abrir Site' });
    expect(link).toHaveAttribute('href', 'https://exemplo.com/p');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    rerender(<SidebarRow icon={<Mail />} label="Site" field="site" value="x" href="javascript:alert(1)" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();

    rerender(<SidebarRow icon={<Mail />} label="Site" field="site" value="x" href="mailto:a@b.com" />);
    expect(screen.getByRole('link', { name: 'Abrir Site' })).toHaveAttribute('href', 'mailto:a@b.com');
  });

  it('valor vazio mostra "—" muted e nenhum botão', () => {
    render(<SidebarRow icon={<Mail />} label="E-mail" field="email" value={null} copyable href="https://x.com" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('vazio + onAdd renderiza link "Adicionar" que dispara o callback', () => {
    const onAdd = vi.fn();
    render(<SidebarRow icon={<Mail />} label="E-mail" field="email" value={null} onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId('sidebar-add-email'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('local=true mostra o marcador "Dado local do Zapp"', () => {
    render(<SidebarRow icon={<Mail />} label="E-mail" field="email" value="a@b.com" local />);
    expect(screen.getByLabelText('Dado local do Zapp')).toBeInTheDocument();
  });

  it('valor truncado mantém o completo no title', () => {
    render(<SidebarRow icon={<Mail />} label="E-mail" field="email" value="email.muito.longo@empresa.com.br" />);
    expect(screen.getByTitle('email.muito.longo@empresa.com.br')).toBeInTheDocument();
  });
});
