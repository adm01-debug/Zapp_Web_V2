/**
 * t_a369905d — paridade V3 -> V2: nenhuma ação destrutiva de conexão sem
 * confirmação, e "Excluir" só para admin.
 *
 * Antes: o botão "Desconectar" e o item "Excluir" do menu chamavam os handlers
 * direto — um clique derrubava a sessão / apagava a instância na Evolution e o
 * vínculo local. Aqui o componente REAL é renderizado e prova-se que:
 *  - supervisor NÃO vê o item "Excluir";
 *  - "Excluir" só executa depois de digitar o nome exato da conexão;
 *  - "Desconectar" só executa depois de confirmar no diálogo;
 *  - Cancelar não chama nada.
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
  created_at: '2026-10-08T00:00:00Z',
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

describe('ConnectionCard — confirmação das ações destrutivas (t_a369905d)', () => {
  it('supervisor NÃO vê o item "Excluir" (só admin), mas continua vendo "Desconectar"', () => {
    roleState.isAdmin = false;
    render(<ConnectionCard {...makeProps()} />);
    expect(screen.queryByText('Excluir')).toBeNull();
    expect(screen.getByRole('button', { name: /Desconectar/ })).toBeTruthy();
  });

  it('admin vê o item "Excluir"', () => {
    render(<ConnectionCard {...makeProps()} />);
    expect(screen.getByText('Excluir')).toBeTruthy();
  });

  it('"Excluir" não executa no clique: abre o diálogo e exige digitar o nome exato', async () => {
    const props = makeProps();
    render(<ConnectionCard {...props} />);

    fireEvent.click(screen.getByText('Excluir'));
    const dialog = await screen.findByRole('alertdialog');
    expect(props.onDelete).not.toHaveBeenCalled();

    const confirmar = within(dialog).getByRole('button', { name: 'Excluir conexão' });
    // Sem digitar nada: a ação está bloqueada e o clique não executa.
    expect(confirmar).toBeDisabled();
    fireEvent.click(confirmar);
    expect(props.onDelete).not.toHaveBeenCalled();

    // Nome errado: continua bloqueada.
    const campo = within(dialog).getByLabelText(/Digite Principal para confirmar/);
    fireEvent.change(campo, { target: { value: 'Principal 2' } });
    expect(within(dialog).getByRole('button', { name: 'Excluir conexão' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir conexão' }));
    expect(props.onDelete).not.toHaveBeenCalled();

    // Nome exato: libera e executa UMA vez com a conexão do cartão.
    fireEvent.change(campo, { target: { value: 'Principal' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir conexão' }));
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledTimes(1));
    expect(props.onDelete).toHaveBeenCalledWith(connection);
  });

  it('"Desconectar" pede confirmação com nome e número mascarado, e só executa ao confirmar', async () => {
    const props = makeProps();
    render(<ConnectionCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Desconectar/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(props.onDisconnect).not.toHaveBeenCalled();

    // O telefone inteiro não aparece: só o DDI e os 4 últimos dígitos.
    expect(within(dialog).getByText(/\+55 \*{5}-0000/)).toBeTruthy();
    expect(within(dialog).queryByText(/90000/)).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    await waitFor(() => expect(props.onDisconnect).toHaveBeenCalledTimes(1));
    expect(props.onDisconnect).toHaveBeenCalledWith(connection);
  });

  it('cancelar o diálogo não chama nem desconectar nem excluir', async () => {
    const props = makeProps();
    render(<ConnectionCard {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /Desconectar/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    fireEvent.click(screen.getByText('Excluir'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    expect(props.onDisconnect).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});

/**
 * t_9cc4f1c2 — a entrada "Auditoria da conexão" é de leitura e só admin vê
 * (a policy de audit_logs libera admin/supervisor; a tela é mais estrita).
 * Sem instance_id não há trilha a ler, então o item não aparece.
 */
describe('ConnectionCard — entrada "Auditoria da conexão" (t_9cc4f1c2)', () => {
  it('admin vê o item quando a conexão tem instância', () => {
    render(<ConnectionCard {...makeProps()} />);
    expect(screen.getByText('Auditoria da conexão')).toBeTruthy();
  });

  it('supervisor NÃO vê o item', () => {
    roleState.isAdmin = false;
    render(<ConnectionCard {...makeProps()} />);
    expect(screen.queryByText('Auditoria da conexão')).toBeNull();
  });

  it('conexão sem instance_id não oferece o item', () => {
    render(<ConnectionCard {...makeProps()} connection={{ ...connection, instance_id: null }} />);
    expect(screen.queryByText('Auditoria da conexão')).toBeNull();
  });
});
