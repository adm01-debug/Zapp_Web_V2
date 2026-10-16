import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * t_3913180a — ativar whitelist/blacklist mudava o modo direto, sem confirmação e sem
 * mostrar o país detectado: o admin podia trancar o próprio acesso num clique só.
 * A regra de recusa é do hook (t_21aa57dc); aqui se prova a TELA: nada é gravado antes
 * de confirmar, o botão de confirmar fica desabilitado com o motivo do hook e a falha
 * de leitura do país aparece em vez de ser engolida.
 */

const { rpcMock, fromMock, updateMock, getUserMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock,
    auth: { getUser: getUserMock },
  },
}));

import { GeoBlockingPanel } from '../GeoBlockingPanel';
import { ERRO_AO_LER_STATUS_DE_REDE } from '@/hooks/system/useMyNetworkStatus';

const pais = (code: string, name: string) => ({
  id: `c-${code}`,
  country_code: code,
  country_name: name,
  created_at: '2026-10-01T00:00:00.000Z',
});

/** Leituras reais (a RPC do país + as 3 consultas do hook), sem mock de hook: a prova renderiza o painel de verdade. */
function prepararLeituras({
  mode = 'disabled',
  allowed = [] as unknown[],
  blocked = [] as unknown[],
} = {}) {
  rpcMock.mockResolvedValue({ data: [{ country: 'BR', ip_seen: '203.0.113.7' }], error: null });
  fromMock.mockImplementation((tabela: string) => ({
    select: () => ({
      limit: () => ({ single: async () => ({ data: { id: 's-1', mode }, error: null }) }),
      order: async () => ({ data: tabela === 'allowed_countries' ? allowed : blocked, error: null }),
    }),
    update: (payload: unknown) => {
      updateMock(payload);
      return { eq: async () => ({ error: null }) };
    },
  }));
}

describe('GeoBlockingPanel: ativar exige confirmação e mostra o país detectado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    prepararLeituras();
  });

  it('mostra o país detectado e recusa a ativação sem gravar nada', async () => {
    render(<GeoBlockingPanel />);
    await screen.findByTestId('geo-pais-detectado');
    expect(screen.getByTestId('geo-pais-detectado')).toHaveTextContent('Seu país detectado: Brasil (BR)');

    // whitelist sem o BR: o hook recusa — o clique abre o diálogo e NADA foi escrito
    fireEvent.click(screen.getByRole('button', { name: 'Whitelist' }));
    const motivo = await screen.findByTestId('geo-motivo-recusa');
    expect(motivo).toHaveTextContent('A whitelist não inclui o país do seu acesso');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Seu país detectado: Brasil (BR)');
    expect(screen.getByTestId('geo-confirmar-modo')).toBeDisabled();
    expect(updateMock).not.toHaveBeenCalled();

    // nem clicando no botão desabilitado
    fireEvent.click(screen.getByTestId('geo-confirmar-modo'));
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('confirmado, a troca permitida grava o modo escolhido', async () => {
    prepararLeituras({ allowed: [pais('BR', 'Brasil')] });
    render(<GeoBlockingPanel />);
    await screen.findByTestId('geo-pais-detectado');

    fireEvent.click(screen.getByRole('button', { name: 'Whitelist' }));
    const confirmar = await screen.findByTestId('geo-confirmar-modo');
    expect(confirmar).toBeEnabled();
    expect(screen.queryByTestId('geo-motivo-recusa')).toBeNull();
    expect(updateMock).not.toHaveBeenCalled(); // abrir o diálogo não grava

    fireEvent.click(confirmar);
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0][0]).toMatchObject({ mode: 'whitelist' });
  });

  it('desativar continua permitido (nunca tranca o acesso) e também passa pela confirmação', async () => {
    prepararLeituras({ mode: 'blacklist', blocked: [pais('BR', 'Brasil')] });
    render(<GeoBlockingPanel />);
    await screen.findByTestId('geo-pais-detectado');

    fireEvent.click(screen.getByRole('button', { name: 'Desativado' }));
    const confirmar = await screen.findByTestId('geo-confirmar-modo');
    expect(confirmar).toBeEnabled();
    expect(screen.queryByTestId('geo-motivo-recusa')).toBeNull();
    expect(updateMock).not.toHaveBeenCalled();

    fireEvent.click(confirmar);
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0][0]).toMatchObject({ mode: 'disabled' });
  });

  it('falha de leitura do país aparece na tela e bloqueia a ativação', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    render(<GeoBlockingPanel />);

    const erro = await screen.findByTestId('geo-pais-erro');
    expect(erro).toHaveTextContent(ERRO_AO_LER_STATUS_DE_REDE);
    expect(screen.queryByTestId('geo-pais-detectado')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Blacklist' }));
    expect(await screen.findByTestId('geo-motivo-recusa')).toHaveTextContent(
      'Não foi possível confirmar o país do seu acesso',
    );
    expect(screen.getByTestId('geo-confirmar-modo')).toBeDisabled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
