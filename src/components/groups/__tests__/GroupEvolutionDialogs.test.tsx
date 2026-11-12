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
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));

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

  it('sem prévia na conexão (notSupported, Evolution GO) avisa em português e libera entrar sem prévia', async () => {
    api.getInviteInfo.mockRejectedValue(Object.assign(new Error('invite-info não é suportado na Evolution GO.'), { notSupported: true }));
    api.acceptInvite.mockResolvedValue({});
    render(<JoinGroupByInviteDialog open onOpenChange={vi.fn()} connections={[conexao]} />);

    fireEvent.change(screen.getByLabelText(/link ou código/i), { target: { value: 'AbC123' } });
    fireEvent.click(screen.getByRole('button', { name: /ver convite/i }));

    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledWith('A prévia do convite não está disponível nesta conexão do WhatsApp (Evolution GO).'));
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(screen.queryByTestId('previa-convite')).not.toBeInTheDocument();
    expect(screen.getByTestId('convite-sem-previa')).toBeInTheDocument();

    const entrar = screen.getByRole('button', { name: /entrar no grupo/i });
    expect(entrar).toBeEnabled();
    fireEvent.click(entrar);
    await waitFor(() => expect(api.acceptInvite).toHaveBeenCalledWith('PRINCIPAL', 'AbC123'));
  });

  it('erro de verdade na prévia continua erro e não libera entrar', async () => {
    api.getInviteInfo.mockRejectedValue(new Error('Convite expirado'));
    render(<JoinGroupByInviteDialog open onOpenChange={vi.fn()} connections={[conexao]} />);

    fireEvent.change(screen.getByLabelText(/link ou código/i), { target: { value: 'AbC123' } });
    fireEvent.click(screen.getByRole('button', { name: /ver convite/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Convite expirado'));
    expect(screen.getByRole('button', { name: /entrar no grupo/i })).toBeDisabled();
  });

  it('trocar o link depois do aviso volta a exigir a consulta', async () => {
    api.getInviteInfo.mockRejectedValue(Object.assign(new Error('x'), { notSupported: true }));
    render(<JoinGroupByInviteDialog open onOpenChange={vi.fn()} connections={[conexao]} />);

    fireEvent.change(screen.getByLabelText(/link ou código/i), { target: { value: 'AbC123' } });
    fireEvent.click(screen.getByRole('button', { name: /ver convite/i }));
    await screen.findByTestId('convite-sem-previa');

    fireEvent.change(screen.getByLabelText(/link ou código/i), { target: { value: 'Outro99' } });
    expect(screen.queryByTestId('convite-sem-previa')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar no grupo/i })).toBeDisabled();
  });
});

function escolherDuracao(opcao: string) {
  const trigger = screen.getByRole('combobox', { name: 'Duração' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: opcao }));
}

describe('GroupEphemeralDialog', () => {
  it('nada vem pré-selecionado: Aplicar fica desabilitado até escolher a duração', () => {
    render(<GroupEphemeralDialog open onOpenChange={vi.fn()} instanceName="PRINCIPAL" groupJid="123@g.us" groupName="Fornecedores" />);
    expect(screen.getByRole('combobox', { name: 'Duração' })).toHaveTextContent('Escolha a duração');
    expect(screen.getByRole('button', { name: /^aplicar$/i })).toBeDisabled();
    expect(api.toggleEphemeral).not.toHaveBeenCalled();
  });

  it('aplica a duração escolhida no grupo pela conexão dele', async () => {
    api.toggleEphemeral.mockResolvedValue({});
    const onOpenChange = vi.fn();
    render(<GroupEphemeralDialog open onOpenChange={onOpenChange} instanceName="PRINCIPAL" groupJid="123@g.us" groupName="Fornecedores" />);

    escolherDuracao('7 dias');
    fireEvent.click(screen.getByRole('button', { name: /^aplicar$/i }));

    await waitFor(() => expect(api.toggleEphemeral).toHaveBeenCalledWith('PRINCIPAL', '123@g.us', 604800));
    expect(toastMock.success).toHaveBeenCalledWith('Mensagens temporárias ativadas');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('desligar só quando escolhido explicitamente', async () => {
    api.toggleEphemeral.mockResolvedValue({});
    render(<GroupEphemeralDialog open onOpenChange={vi.fn()} instanceName="PRINCIPAL" groupJid="123@g.us" groupName="Fornecedores" />);

    escolherDuracao('Desligado');
    fireEvent.click(screen.getByRole('button', { name: /^aplicar$/i }));

    await waitFor(() => expect(api.toggleEphemeral).toHaveBeenCalledWith('PRINCIPAL', '123@g.us', 0));
    expect(toastMock.success).toHaveBeenCalledWith('Mensagens temporárias desligadas');
  });

  it('notSupported (Evolution GO) vira aviso em português, não erro com nome de rota', async () => {
    api.toggleEphemeral.mockRejectedValue(Object.assign(new Error('toggle-ephemeral não é suportado na Evolution GO.'), { notSupported: true }));
    render(<GroupEphemeralDialog open onOpenChange={vi.fn()} instanceName="PRINCIPAL" groupJid="123@g.us" groupName="Fornecedores" />);

    escolherDuracao('24 horas');
    fireEvent.click(screen.getByRole('button', { name: /^aplicar$/i }));

    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledWith('Mensagens temporárias não está disponível nesta conexão do WhatsApp (Evolution GO).'));
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('grupo sem conexão vinculada não chama a Edge', async () => {
    render(<GroupEphemeralDialog open onOpenChange={vi.fn()} instanceName="" groupJid="123@g.us" groupName="X" />);
    escolherDuracao('24 horas');
    fireEvent.click(screen.getByRole('button', { name: /^aplicar$/i }));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(api.toggleEphemeral).not.toHaveBeenCalled();
  });
});
