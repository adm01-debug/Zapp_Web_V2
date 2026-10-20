import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// R2-API-040 (item 214 do BACKLOG_VERIFICADO): o editor de privacidade
// inicializava o formulário com valores fixos ('all'/'contacts') e salvava TODOS
// os campos. Numa conta mais restrita, alterar um campo reabria os outros que o
// operador não tocou. O contrato provado aqui: campo não carregado fica
// "Manter atual"; o payload leva SÓ o que o operador escolheu; e trocar de
// instância descarta o rascunho anterior.

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

// Primitivos do Radix trocados por contêineres simples (mesma convenção das
// outras suítes do repositório): o alvo aqui é o payload, não a aba.
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

const CAMPOS = [
  'Confirmação de leitura',
  'Foto de perfil',
  'Status/recado',
  'Online',
  'Visto por último',
  'Adicionar em grupos',
] as const;

const abrir = (instanceName = 'conexao-1') => (
  <InstanceSettingsDialog
    open
    onOpenChange={vi.fn()}
    instanceName={instanceName}
    connectionName="Conexão 1"
  />
);

const seletorDoCampo = (rotulo: string): HTMLSelectElement => {
  const alvo = screen.getByText(rotulo).parentElement?.querySelector('select');
  if (!alvo) throw new Error(`seletor do campo "${rotulo}" não encontrado`);
  return alvo;
};

const salvar = () => screen.getByRole('button', { name: /Salvar Privacidade/ });

describe('InstanceSettingsDialog — privacidade envia só o que foi alterado', () => {
  beforeEach(() => {
    h.updatePrivacySettings.mockReset();
    h.toast.success.mockReset();
    h.toast.error.mockReset();
    h.getSettings.mockReset().mockResolvedValue(undefined);
    h.setSettings.mockReset().mockResolvedValue(undefined);
    h.fetchProfile.mockReset().mockResolvedValue(undefined);
    h.findLabels.mockReset().mockResolvedValue([]);
  });

  it('não envia nenhum campo de privacidade quando o operador não alterou nada', async () => {
    render(abrir());
    await waitFor(() => expect(h.getSettings).toHaveBeenCalledWith('conexao-1'));

    const botao = salvar();
    expect(botao).toBeDisabled();
    fireEvent.click(botao);
    expect(h.updatePrivacySettings).not.toHaveBeenCalled();
  });

  it('envia somente o campo alterado, sem os padrões locais', async () => {
    render(abrir());
    await waitFor(() => expect(h.getSettings).toHaveBeenCalledWith('conexao-1'));

    fireEvent.change(seletorDoCampo('Confirmação de leitura'), { target: { value: 'contacts' } });
    fireEvent.click(salvar());

    await waitFor(() => expect(h.updatePrivacySettings).toHaveBeenCalledTimes(1));
    // Sem os outros cinco campos: a configuração atual da conta não é reescrita
    // com o padrão local do formulário.
    expect(h.updatePrivacySettings).toHaveBeenCalledWith({
      instanceName: 'conexao-1',
      readreceipts: 'contacts',
    });
  });

  it('apresenta campo não carregado como "Manter atual", nunca como padrão local', async () => {
    render(abrir());
    await waitFor(() => expect(h.getSettings).toHaveBeenCalledWith('conexao-1'));

    for (const rotulo of CAMPOS) {
      const seletor = seletorDoCampo(rotulo);
      expect(seletor.options[seletor.selectedIndex]?.textContent).toBe('Manter atual');
      expect(seletor.value).toBe('');
    }
  });

  it('voltar o campo para "Manter atual" tira ele do envio', async () => {
    render(abrir());
    await waitFor(() => expect(h.getSettings).toHaveBeenCalledWith('conexao-1'));

    const campo = seletorDoCampo('Confirmação de leitura');
    fireEvent.change(campo, { target: { value: 'contacts' } });
    expect(salvar()).toBeEnabled();
    fireEvent.change(campo, { target: { value: '' } });

    expect(salvar()).toBeDisabled();
    fireEvent.click(salvar());
    expect(h.updatePrivacySettings).not.toHaveBeenCalled();
  });

  it('descarta o rascunho ao trocar de instância', async () => {
    const { rerender } = render(abrir('conexao-1'));
    await waitFor(() => expect(h.getSettings).toHaveBeenCalledWith('conexao-1'));

    fireEvent.change(seletorDoCampo('Confirmação de leitura'), { target: { value: 'contacts' } });
    expect(salvar()).toBeEnabled();

    rerender(abrir('conexao-2'));
    await waitFor(() => expect(h.getSettings).toHaveBeenCalledWith('conexao-2'));

    const botao = salvar();
    await waitFor(() => expect(botao).toBeDisabled());
    fireEvent.click(botao);
    expect(h.updatePrivacySettings).not.toHaveBeenCalled();
  });

  it('cada seletor de privacidade tem nome acessível', async () => {
    render(abrir());
    await waitFor(() => expect(h.getSettings).toHaveBeenCalledWith('conexao-1'));

    for (const rotulo of CAMPOS) {
      expect(screen.getByLabelText(rotulo)).toBe(seletorDoCampo(rotulo));
    }
  });
});
