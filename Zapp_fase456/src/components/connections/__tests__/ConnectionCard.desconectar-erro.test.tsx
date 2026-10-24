/**
 * t_cce2f0f7 — "Desconectar" não pode fechar o diálogo como se tivesse dado
 * certo quando a sessão NÃO caiu (Evolution GO recusou a instância, ou o
 * vínculo local não foi atualizado).
 *
 * O sujeito é o componente REAL (o diálogo vem do Radix, sem mock): o handler
 * devolve `false` (ou rejeita) e a prova é o diálogo continuar aberto com o
 * motivo em `role="alert"`, o botão avisar "Desconectando…" e ficar bloqueado
 * enquanto a chamada está em curso, e o diálogo só fechar no sucesso.
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

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

async function abrirConfirmacao() {
  fireEvent.click(screen.getByRole('button', { name: /Desconectar/ }));
  return await screen.findByRole('alertdialog');
}

beforeEach(() => {
  roleState.isAdmin = true;
});

describe('ConnectionCard — "Desconectar" só fecha o diálogo no sucesso (t_cce2f0f7)', () => {
  it('handler devolve false: o diálogo continua aberto com o motivo', async () => {
    const props = makeProps();
    props.onDisconnect = vi.fn().mockResolvedValue(false);
    render(<ConnectionCard {...props} />);

    const dialog = await abrirConfirmacao();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    await waitFor(() => expect(props.onDisconnect).toHaveBeenCalledTimes(1));
    const alerta = await within(screen.getByRole('alertdialog')).findByRole('alert');
    expect(alerta.textContent).toMatch(/não foi possível desconectar/i);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('a chamada rejeita: o diálogo continua aberto (nunca fecha como sucesso)', async () => {
    const props = makeProps();
    props.onDisconnect = vi.fn().mockRejectedValue(new Error('Evolution GO indisponível'));
    render(<ConnectionCard {...props} />);

    const dialog = await abrirConfirmacao();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    await waitFor(() => expect(props.onDisconnect).toHaveBeenCalledTimes(1));
    expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toBeTruthy();
  });

  it('sucesso: o diálogo fecha', async () => {
    const props = makeProps();
    props.onDisconnect = vi.fn().mockResolvedValue(true);
    render(<ConnectionCard {...props} />);

    const dialog = await abrirConfirmacao();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('enquanto a chamada está em curso o botão avisa "Desconectando…" e não dá para repetir nem cancelar', async () => {
    const d = deferred<boolean>();
    const props = makeProps();
    props.onDisconnect = vi.fn().mockReturnValue(d.promise);
    render(<ConnectionCard {...props} />);

    const dialog = await abrirConfirmacao();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    const emCurso = await within(screen.getByRole('alertdialog')).findByRole('button', { name: /Desconectando/ });
    expect(emCurso).toBeDisabled();
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    // Clique repetido durante a espera não dispara uma segunda desconexão.
    fireEvent.click(emCurso);
    expect(props.onDisconnect).toHaveBeenCalledTimes(1);

    d.resolve(true);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('reabrir o diálogo depois de uma falha não mostra o motivo antigo', async () => {
    const props = makeProps();
    props.onDisconnect = vi.fn().mockResolvedValue(false);
    render(<ConnectionCard {...props} />);

    const dialog = await abrirConfirmacao();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desconectar' }));
    await within(screen.getByRole('alertdialog')).findByRole('alert');

    // Cancelar fecha (o erro é da tentativa, não do estado da conexão).
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    const reaberto = await abrirConfirmacao();
    expect(within(reaberto).queryByRole('alert')).toBeNull();
  });
});
