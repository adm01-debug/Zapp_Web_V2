/**
 * t_53fc1ddb — estados do cartão de conexão: aguardando no desconectar, ID cru
 * escondido e rótulo de tentativas em pt-BR.
 *
 * O componente REAL é renderizado. Prova-se que:
 *  - com `disconnecting`, o botão vira "Desconectando…", fica desabilitado,
 *    marca aria-busy e NÃO abre o diálogo;
 *  - o instance_id cru não aparece mais no corpo do cartão;
 *  - o rótulo de retentativas está em português ("Tentativa x/y");
 *  - o diálogo só fecha quando o desconectar assíncrono termina.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const roleState = vi.hoisted(() => ({ isAdmin: true }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));
vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: import('react').ReactNode }) => <div>{children}</div> },
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <button type="button" role="menuitem" onClick={onClick}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
}));
vi.mock('../BusinessHoursIndicator', () => ({ BusinessHoursIndicator: () => null }));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({
    isAdmin: roleState.isAdmin,
    isSupervisor: roleState.isAdmin,
    roles: roleState.isAdmin ? ['admin'] : ['supervisor'],
    loading: false,
  }),
}));

import { ConnectionCard } from '../ConnectionCard';

const connection = {
  id: 'conn-1', name: 'Principal', phone_number: '+55 11 90000-0000',
  instance_id: 'inst-1', status: 'connected', qr_code: null, is_default: true,
  created_at: '2026-10-13T00:00:00Z',
};

function makeProps() {
  return {
    connection, syncingHistory: null, onShowQrCode: vi.fn(), onCopyId: vi.fn(),
    onDisconnect: vi.fn(), onSetDefault: vi.fn(), onDelete: vi.fn(),
    onBusinessHours: vi.fn(), onQueues: vi.fn(), onSettings: vi.fn(), onSyncHistory: vi.fn(),
  };
}

beforeEach(() => {
  roleState.isAdmin = true;
});

describe('ConnectionCard — estado de espera e rótulos (t_53fc1ddb)', () => {
  it('em repouso: botão "Desconectar" habilitado', () => {
    render(<ConnectionCard {...makeProps()} />);
    expect(screen.getByRole('button', { name: /^Desconectar$/ })).toBeEnabled();
  });

  it('desconectando: vira "Desconectando…", fica desabilitado, pulsando e não abre o diálogo', () => {
    render(<ConnectionCard {...makeProps()} disconnecting />);
    const botao = screen.getByRole('button', { name: /Desconectando/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('aria-busy', 'true');
    expect(botao.className).toContain('motion-safe:animate-pulse');

    fireEvent.click(botao);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('não mostra o instance_id cru no corpo do cartão', () => {
    render(<ConnectionCard {...makeProps()} />);
    expect(screen.queryByText('inst-1')).toBeNull();
    expect(screen.queryByText(/Instância:/)).toBeNull();
  });

  it('rótulo de retentativas em pt-BR: "Tentativa x/y", sem "Retry"', () => {
    render(
      <ConnectionCard
        {...makeProps()}
        connection={{ ...connection, retry_count: 2, max_retries: 5 }}
      />,
    );
    expect(screen.getByText(/Tentativa 2\/5/)).toBeTruthy();
    expect(screen.queryByText(/Retry/)).toBeNull();
  });

  it('o diálogo só fecha depois que o desconectar assíncrono resolve', async () => {
    let resolver!: () => void;
    const emVoo = new Promise<void>((resolve) => { resolver = resolve; });
    const props = makeProps();
    props.onDisconnect = vi.fn().mockReturnValue(emVoo);
    render(<ConnectionCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /^Desconectar$/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    await waitFor(() => expect(props.onDisconnect).toHaveBeenCalledWith(connection));
    // Ainda em voo: o diálogo continua aberto.
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    resolver();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
