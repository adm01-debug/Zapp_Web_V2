/**
 * Abas **Config** e **Perfil** do diálogo da instância — `InstanceSettingsDialog`.
 *
 * O sujeito é o componente REAL; a única dublagem é o cliente Evolution
 * (`useEvolutionApi`), que grava o payload e responde o que o teste manda.
 * Primitivos do Radix viram contêineres simples (mesma convenção da suíte de
 * privacidade) — o alvo é o payload e o estado do formulário, não a aba.
 *
 * Cartão: falta teste das abas Config e Perfil na V2.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  updatePrivacySettings: vi.fn(),
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  fetchProfile: vi.fn(),
  updateProfileName: vi.fn(),
  updateProfileStatus: vi.fn(),
  updateProfilePicture: vi.fn(),
  removeProfilePicture: vi.fn(),
  findLabels: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    getSettings: h.getSettings,
    setSettings: h.setSettings,
    fetchProfile: h.fetchProfile,
    updateProfileName: h.updateProfileName,
    updateProfileStatus: h.updateProfileStatus,
    updateProfilePicture: h.updateProfilePicture,
    removeProfilePicture: h.removeProfilePicture,
    updatePrivacySettings: h.updatePrivacySettings,
    findLabels: h.findLabels,
  }),
}));

vi.mock('sonner', () => ({ toast: h.toast }));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { InstanceSettingsDialog } from '../InstanceSettingsDialog';

const abrir = (instanceName = 'conexao-1') => (
  <InstanceSettingsDialog open onOpenChange={vi.fn()} instanceName={instanceName} connectionName="Conexão 1" />
);

const salvarConfig = () => screen.getByRole('button', { name: /Salvar Configurações/ });
const salvarPerfil = () => screen.getByRole('button', { name: /Salvar Perfil/ });
const nomeInput = () => screen.getByPlaceholderText('Nome do perfil') as HTMLInputElement;
const statusInput = () => screen.getByPlaceholderText('Seu recado aqui...') as HTMLInputElement;
const fotoInput = () => screen.getByPlaceholderText('https://exemplo.com/foto.jpg') as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.getSettings.mockResolvedValue(undefined);
  h.setSettings.mockResolvedValue(undefined);
  h.fetchProfile.mockResolvedValue(undefined);
  h.findLabels.mockResolvedValue([]);
});

describe('InstanceSettingsDialog — aba Config', () => {
  it('carrega as configurações da instância e reflete os valores do provedor', async () => {
    h.getSettings.mockResolvedValue({
      rejectCall: true,
      msgCall: 'Não posso atender agora',
      groupsIgnore: false,
      alwaysOnline: false,
      readMessages: true,
      readStatus: false,
      syncFullHistory: false,
    });

    render(abrir());

    await waitFor(() => expect(h.getSettings).toHaveBeenCalledWith('conexao-1'));
    await waitFor(() =>
      expect(screen.getByLabelText('Rejeitar chamadas').getAttribute('aria-checked')).toBe('true'),
    );
    expect(screen.getByLabelText('Leitura automática').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText('Ignorar grupos').getAttribute('aria-checked')).toBe('false');
    // rejectCall ligado revela o campo de mensagem, já com o valor do provedor.
    expect(screen.getByDisplayValue('Não posso atender agora')).toBeTruthy();
  });

  it('salvar envia o estado completo da aba com o nome da instância', async () => {
    h.getSettings.mockResolvedValue({ rejectCall: false, msgCall: '', alwaysOnline: false });

    render(abrir());
    await waitFor(() => expect(h.getSettings).toHaveBeenCalledWith('conexao-1'));

    fireEvent.click(screen.getByLabelText('Sempre online'));
    expect(screen.getByLabelText('Sempre online').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(salvarConfig());

    await waitFor(() => expect(h.setSettings).toHaveBeenCalledTimes(1));
    expect(h.setSettings).toHaveBeenCalledWith({
      instanceName: 'conexao-1',
      rejectCall: false,
      msgCall: '',
      groupsIgnore: false,
      alwaysOnline: true,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
    });
    expect(h.toast.success).toHaveBeenCalledWith('Configurações salvas!');
  });

  it('recusa do provedor não finge sucesso: mostra erro', async () => {
    h.getSettings.mockResolvedValue({});
    h.setSettings.mockRejectedValue(new Error('boom'));

    render(abrir());
    await waitFor(() => expect(h.getSettings).toHaveBeenCalledWith('conexao-1'));

    fireEvent.click(salvarConfig());

    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith('Erro ao salvar'));
    expect(h.toast.success).not.toHaveBeenCalledWith('Configurações salvas!');
  });
});

describe('InstanceSettingsDialog — aba Perfil', () => {
  it('carrega nome, recado e foto do perfil da instância', async () => {
    h.fetchProfile.mockResolvedValue({
      name: 'Loja Centro',
      status: 'Atendimento das 9h às 18h',
      profilePictureUrl: 'https://exemplo.com/loja.png',
    });

    render(abrir());

    await waitFor(() => expect(h.fetchProfile).toHaveBeenCalledWith('conexao-1'));
    await waitFor(() => expect(nomeInput().value).toBe('Loja Centro'));
    expect(statusInput().value).toBe('Atendimento das 9h às 18h');
    expect(fotoInput().value).toBe('https://exemplo.com/loja.png');
    expect(screen.getByAltText('Profile')).toBeTruthy();
  });

  it('Salvar Perfil grava nome e recado da instância', async () => {
    h.fetchProfile.mockResolvedValue({ name: 'Antigo', status: 'Antigo recado' });

    render(abrir());
    await waitFor(() => expect(nomeInput().value).toBe('Antigo'));

    fireEvent.change(nomeInput(), { target: { value: 'Novo nome' } });
    fireEvent.change(statusInput(), { target: { value: 'Novo recado' } });
    fireEvent.click(salvarPerfil());

    await waitFor(() => expect(h.updateProfileName).toHaveBeenCalledWith('conexao-1', 'Novo nome'));
    expect(h.updateProfileStatus).toHaveBeenCalledWith('conexao-1', 'Novo recado');
    expect(h.toast.success).toHaveBeenCalledWith('Perfil atualizado!');
  });

  it('campo em branco não é enviado (não apaga o que já está na conta)', async () => {
    h.fetchProfile.mockResolvedValue({ name: 'Antigo', status: 'Recado atual' });

    render(abrir());
    await waitFor(() => expect(nomeInput().value).toBe('Antigo'));

    fireEvent.change(nomeInput(), { target: { value: '' } });
    fireEvent.click(salvarPerfil());

    await waitFor(() => expect(h.updateProfileStatus).toHaveBeenCalledWith('conexao-1', 'Recado atual'));
    expect(h.updateProfileName).not.toHaveBeenCalled();
  });

  it('Aplicar grava a foto; Remover apaga a foto e limpa o campo', async () => {
    h.fetchProfile.mockResolvedValue({ name: 'Loja', status: '', profilePictureUrl: 'https://exemplo.com/a.png' });

    render(abrir());
    await waitFor(() => expect(fotoInput().value).toBe('https://exemplo.com/a.png'));

    fireEvent.change(fotoInput(), { target: { value: 'https://exemplo.com/b.png' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() =>
      expect(h.updateProfilePicture).toHaveBeenCalledWith('conexao-1', 'https://exemplo.com/b.png'),
    );
    expect(h.toast.success).toHaveBeenCalledWith('Foto atualizada!');

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(h.removeProfilePicture).toHaveBeenCalledWith('conexao-1'));
    expect(fotoInput().value).toBe('');
    expect(h.toast.success).toHaveBeenCalledWith('Foto removida');
  });

  it.todo('PL-03 (iris): a aba Etiquetas mostra erro honesto quando findLabels falha');
});

describe('InstanceSettingsDialog — fora da minha área (registrado no cartão)', () => {
  it.todo('PL-06 (iris): tela de horário honesta e janela noturna');
});
