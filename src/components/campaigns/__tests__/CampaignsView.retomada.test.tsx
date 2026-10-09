/**
 * R2-MOD-006 (#388) — "Campanha pausada não tem comando de retomada".
 *
 * Defeito medido no código atual de CampaignsView:
 *  - a lista só oferece "Iniciar" para `draft` e "Pausar" para `sending`; uma
 *    campanha em `paused` ficava sem nenhuma ação de retomada;
 *  - o filtro de status não oferecia "Pausada", então a campanha pausada não
 *    podia ser isolada na lista;
 *  - o painel de detalhes não implementava a retomada.
 *
 * A prova renderiza o componente REAL (CampaignsView) e dispara o clique do
 * usuário. Só as dependências de fronteira são substituídas: o cliente Supabase,
 * o hook de dados (`useCampaigns` — a camada de rede) e as primitivas de UI
 * (Select/Dialog), que o jsdom não abre sozinho — mesmo padrão já usado nos
 * testes desta pasta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';

// `vi.hoisted`: o stub do Select guarda o `onValueChange` de verdade da tela
// para que o clique na opção "Pausada" exercite o filtro real do componente.
const { selectHandlers } = vi.hoisted(() => ({
  selectHandlers: { current: null as ((value: string) => void) | null },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    functions: { invoke: vi.fn() },
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: {}, profile: null, loading: false }),
  AuthProvider: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, layout: _layout, ...props }: { children?: ReactNode; layout?: unknown } & Record<string, unknown>) =>
      <div {...(props as object)}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
}));

// O painel de A/B testing é carregado por import dinâmico dentro do painel de
// detalhes; aqui ele não participa do defeito e vira um stub vazio.
vi.mock('@/components/campaigns/CampaignABTesting', () => ({
  CampaignABTesting: () => null,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children }: { onValueChange?: (value: string) => void; children?: ReactNode }) => {
    selectHandlers.current = onValueChange ?? null;
    return <div>{children}</div>;
  },
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children?: ReactNode; value: string }) => (
    <button type="button" data-value={value} onClick={() => selectHandlers.current?.(value)}>{children}</button>
  ),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
}));

const { mockUpdateCampaign, mockCreateCampaign, mockDeleteCampaign } = vi.hoisted(() => ({
  mockUpdateCampaign: { mutate: vi.fn(), isPending: false },
  mockCreateCampaign: { mutate: vi.fn(), isPending: false },
  mockDeleteCampaign: { mutate: vi.fn(), isPending: false },
}));

let mockCampaigns: Campaign[] = [];

vi.mock('@/hooks/communication/useCampaigns', () => ({
  useCampaigns: () => ({
    campaigns: mockCampaigns,
    isLoading: false,
    createCampaign: mockCreateCampaign,
    updateCampaign: mockUpdateCampaign,
    deleteCampaign: mockDeleteCampaign,
  }),
}));

import { CampaignsView } from '@/components/campaigns/CampaignsView';
import type { Campaign } from '@/hooks/communication/useCampaigns';

function campanha(over: Partial<Campaign> & { id: string; name: string; status: string }): Campaign {
  return {
    description: null,
    total_contacts: 10,
    sent_count: 4,
    delivered_count: 3,
    read_count: 1,
    failed_count: 0,
    message_content: 'Olá',
    created_at: '2026-10-01T12:00:00.000Z',
    ...over,
  } as unknown as Campaign;
}

const PAUSADA = campanha({ id: 'camp-pausada', name: 'Campanha pausada', status: 'paused' });
const RASCUNHO = campanha({ id: 'camp-rascunho', name: 'Campanha rascunho', status: 'draft' });
const ENVIANDO = campanha({ id: 'camp-enviando', name: 'Campanha enviando', status: 'sending' });

describe('CampaignsView — retomada de campanha pausada (R2-MOD-006 #388)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCampaigns = [PAUSADA, RASCUNHO, ENVIANDO];
  });

  it('oferece Retomar na campanha pausada e envia o estado para sending', async () => {
    render(<CampaignsView />);

    const retomar = await screen.findByRole('button', { name: 'Retomar campanha' });
    // O rascunho continua com o comando próprio ("Iniciar"), e a pausada não o usa.
    expect(screen.getByRole('button', { name: 'Iniciar campanha' })).toBeInTheDocument();

    fireEvent.click(retomar);

    expect(mockUpdateCampaign.mutate).toHaveBeenCalledWith({ id: 'camp-pausada', status: 'sending' });
    expect(mockUpdateCampaign.mutate).not.toHaveBeenCalledWith({ id: 'camp-rascunho', status: 'sending' });
  });

  it('oferece Pausada no filtro de status e filtra a lista', async () => {
    render(<CampaignsView />);
    expect(await screen.findByText('Campanha rascunho')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pausada' }));

    await waitFor(() => expect(screen.queryByText('Campanha rascunho')).not.toBeInTheDocument());
    expect(screen.getByText('Campanha pausada')).toBeInTheDocument();
    expect(screen.queryByText('Campanha enviando')).not.toBeInTheDocument();
  });

  it('mantém o comando Pausar da campanha em envio', async () => {
    render(<CampaignsView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pausar campanha' }));

    expect(mockUpdateCampaign.mutate).toHaveBeenCalledWith({ id: 'camp-enviando', status: 'paused' });
  });

  it('oferece Retomar no painel de detalhes da campanha pausada', async () => {
    render(<CampaignsView />);

    fireEvent.click(await screen.findByText('Campanha pausada'));
    const detalhes = await screen.findByRole('dialog');

    fireEvent.click(within(detalhes).getByRole('button', { name: 'Retomar campanha' }));

    expect(mockUpdateCampaign.mutate).toHaveBeenCalledWith({ id: 'camp-pausada', status: 'sending' });
  });

  it('nao adiciona Iniciar campanha ao painel de detalhes do rascunho', async () => {
    render(<CampaignsView />);

    fireEvent.click(await screen.findByText('Campanha rascunho'));
    const detalhes = await screen.findByRole('dialog');

    expect(within(detalhes).queryByRole('button', { name: 'Iniciar campanha' })).not.toBeInTheDocument();
    expect(within(detalhes).queryByRole('button', { name: 'Retomar campanha' })).not.toBeInTheDocument();
  });
});
