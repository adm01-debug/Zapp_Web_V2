import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { IntegrationsPanel } from '../IntegrationsPanel';

/**
 * R2-API-041 (item 215) — "Desativar integração esconde o único botão capaz de
 * persistir a desativação".
 *
 * No código auditado o `IntegrationForm` renderizava campos + Salvar + Remover
 * DENTRO do `Boolean(values.enabled) && (...)`. Ao desligar o switch, a ação
 * Salvar era desmontada antes de o operador conseguir enviar `enabled=false`:
 * a integração remota continuava ativa e o diálogo passava a mentir sobre o
 * estado.
 *
 * O jsdom não calcula layout nem cor — o que se prova aqui é estrutura e
 * estado: com a integração ativa, desligar o switch mantém Salvar acessível e
 * ele produz UMA única alteração remota com `enabled: false`.
 */
const h = vi.hoisted(() => ({
  setTypebot: vi.fn(),
  getTypebot: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/hooks/integrations/useEvolutionApi', () => ({
  useEvolutionApi: () => ({
    isLoading: false,
    setTypebot: h.setTypebot,
    getTypebot: h.getTypebot,
    deleteTypebot: vi.fn(),
    setOpenAI: vi.fn(),
    getOpenAI: vi.fn(async () => null),
    deleteOpenAI: vi.fn(),
    setDify: vi.fn(),
    getDify: vi.fn(async () => null),
    deleteDify: vi.fn(),
    setFlowise: vi.fn(),
    getFlowise: vi.fn(async () => null),
    deleteFlowise: vi.fn(),
    setChatwoot: vi.fn(),
    getChatwoot: vi.fn(async () => null),
    deleteChatwoot: vi.fn(),
    setEvolutionBot: vi.fn(),
    getEvolutionBot: vi.fn(async () => null),
    deleteEvolutionBot: vi.fn(),
  }),
}));

// O que o provedor devolve quando o Typebot já está configurado na instância.
const typebotAtivo = { url: 'https://typebot.io', typebot: 'meu-bot' };

function renderPanel() {
  return render(
    <IntegrationsPanel
      open
      onOpenChange={() => {}}
      instanceName="inst-1"
      connectionName="Conexão comercial"
    />,
  );
}

const salvar = () => screen.getByRole('button', { name: /salvar/i });
// O switch "Ativado" da integração é o PRIMEIRO da aba: vem no cabeçalho do
// IntegrationForm, antes dos campos booleanos do Typebot.
const switchAtivado = () => screen.getAllByRole('switch')[0];

describe('IntegrationsPanel — desativar integração preserva a ação de persistir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getTypebot.mockResolvedValue(typebotAtivo);
    h.setTypebot.mockResolvedValue(undefined);
  });

  it('desligar o switch com a integração ativa mantém Salvar acessível e grava enabled=false em UMA chamada', async () => {
    renderPanel();
    // carrega a configuração existente do Typebot
    await screen.findByDisplayValue('meu-bot');
    const salvarAntes = salvar();
    // integração ativa: além do switch principal, os campos booleanos do Typebot
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(1);

    fireEvent.click(switchAtivado());

    // ANTES da correção este botão era desmontado junto com os campos e este
    // getByRole lançava "Unable to find an accessible element with the role
    // 'button' and the name /salvar/i".
    const salvarDepois = salvar();
    expect(salvarDepois).toBe(salvarAntes);

    // os campos dependem do estado ligado e saem; o aviso explica o que fazer
    expect(screen.queryByDisplayValue('meu-bot')).toBeNull();
    expect(screen.getByText(/use salvar para registrar a desativação/i)).toBeTruthy();

    fireEvent.click(salvarDepois);

    await waitFor(() => expect(h.setTypebot).toHaveBeenCalledTimes(1));
    expect(h.setTypebot).toHaveBeenCalledWith(
      expect.objectContaining({ instanceName: 'inst-1', enabled: false }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('integração não carregada (enabled=false) também expõe Salvar', async () => {
    h.getTypebot.mockResolvedValue(null);
    renderPanel();

    await waitFor(() => expect(screen.getByText(/integração desativada/i)).toBeTruthy());
    expect(salvar()).toBeTruthy();

    fireEvent.click(salvar());

    await waitFor(() => expect(h.setTypebot).toHaveBeenCalledTimes(1));
    expect(h.setTypebot.mock.calls[0][0]).toMatchObject({ instanceName: 'inst-1', enabled: false });
  });

  it('falha ao persistir a desativação aparece como erro, nunca como sucesso', async () => {
    h.setTypebot.mockRejectedValue(new Error('provedor recusou'));
    renderPanel();
    await screen.findByDisplayValue('meu-bot');

    fireEvent.click(switchAtivado());
    fireEvent.click(salvar());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });
});
