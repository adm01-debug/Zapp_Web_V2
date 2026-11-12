/**
 * Portas de entrada de `invite-info`/`accept-invite` e `toggle-ephemeral` na tela de
 * Grupos (os wrappers existiam sem tela, e o #2054 apagou as rotas por isso).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getInviteInfo: vi.fn(),
  acceptInvite: vi.fn(),
  toggleEphemeral: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({ useEvolutionApi: () => api }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { GroupEphemeralDialog, JoinGroupByInviteDialog } from '../GroupEvolutionDialogs';
import { extrairCodigoConvite } from '../groupEvolutionOptions';

const conexao = { id: 'c1', name: 'Principal', phone_number: '5511', instance_id: 'PRINCIPAL' };

beforeEach(() => { vi.clearAllMocks(); });

describe('extrairCodigoConvite', () => {
  it('aceita link completo, link /invite e código puro', () => {
    expect(extrairCodigoConvite('https://chat.whatsapp.com/AbC123xyz')).toBe('AbC123xyz');
    expect(extrairCodigoConvite(' chat.whatsapp.com/invite/Zz9 ')).toBe('Zz9');
    expect(extrairCodigoConvite('Qw12')).toBe('Qw12');
  });
});

describe('JoinGroupByInviteDialog', () => {
  it('mostra a prévia do convite (invite-info) e só então entra (accept-invite)', async () => {
    api.getInviteInfo.mockResolvedValue({ subject: 'Fornecedores SP', size: 12 });
    api.acceptInvite.mockResolvedValue({});
    const onJoined = vi.fn();
    render(<JoinGroupByInviteDialog open onOpenChange={vi.fn()} connections={[conexao]} onJoined={onJoined} />);

    const entrar = screen.getByRole('button', { name: /entrar no grupo/i });
    expect(entrar).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/link ou código/i), { target: { value: 'https://chat.whatsapp.com/AbC123' } });
    fireEvent.click(screen.getByRole('button', { name: /ver convite/i }));

    expect(await screen.findByText('Fornecedores SP')).toBeInTheDocument();
    expect(screen.getByText('12 participante(s)')).toBeInTheDocument();
    expect(api.getInviteInfo).toHaveBeenCalledWith('PRINCIPAL', 'AbC123');

    fireEvent.click(screen.getByRole('button', { name: /entrar no grupo/i }));
    await waitFor(() => expect(api.acceptInvite).toHaveBeenCalledWith('PRINCIPAL', 'AbC123'));
    await waitFor(() => expect(onJoined).toHaveBeenCalled());
  });

  it('provedor sem suporte (notSupported) vira aviso de erro e não abre a prévia', async () => {
    api.getInviteInfo.mockRejectedValue(Object.assign(new Error('invite-info não é suportado na Evolution GO.'), { notSupported: true }));
    render(<JoinGroupByInviteDialog open onOpenChange={vi.fn()} connections={[conexao]} />);

    fireEvent.change(screen.getByLabelText(/link ou código/i), { target: { value: 'AbC123' } });
    fireEvent.click(screen.getByRole('button', { name: /ver convite/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('invite-info não é suportado na Evolution GO.'));
    expect(screen.queryByTestId('previa-convite')).not.toBeInTheDocument();
    expect(api.acceptInvite).not.toHaveBeenCalled();
  });
});

describe('GroupEphemeralDialog', () => {
  it('aplica a duração escolhida (padrão: desligado = 0) no grupo pela conexão dele', async () => {
    api.toggleEphemeral.mockResolvedValue({});
    const onOpenChange = vi.fn();
    render(<GroupEphemeralDialog open onOpenChange={onOpenChange} instanceName="PRINCIPAL" groupJid="123@g.us" groupName="Fornecedores" />);

    fireEvent.click(screen.getByRole('button', { name: /^aplicar$/i }));

    await waitFor(() => expect(api.toggleEphemeral).toHaveBeenCalledWith('PRINCIPAL', '123@g.us', 0));
    expect(toastMock.success).toHaveBeenCalledWith('Mensagens temporárias desligadas');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('grupo sem conexão vinculada não chama a Edge', async () => {
    render(<GroupEphemeralDialog open onOpenChange={vi.fn()} instanceName="" groupJid="123@g.us" groupName="X" />);
    fireEvent.click(screen.getByRole('button', { name: /^aplicar$/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(api.toggleEphemeral).not.toHaveBeenCalled();
  });
});
