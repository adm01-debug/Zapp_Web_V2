import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TelefoniaView } from '../TelefoniaView';

/**
 * T33 — shell da view de Telefonia.
 *
 * Aceite do plano: `contentX = 278 ±6` (E.2) ou, sem QA, snapshot RTL do container.
 * Sem QA aqui, provo o CONTRATO do container: existir, ter o `data-testid` citado no
 * aceite e as classes do shell (`flex flex-col gap-4 min-w-0`).
 *
 * Mocks: uma linha por hook, com o caminho REAL de cada um (descoberto no repo — o
 * caminho errado nao da erro, faz o hook real rodar e estourar pedindo o provider) e
 * com a FORMA que o componente consome (array onde ele faz `.find`, funcao onde ele
 * chama). Provider do react-query e o real: o componente usa `useQueryClient`.
 */
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u1', name: 'Agente' }, user: { id: 'u1' } }),
}));
vi.mock('@/providers/CallSessionProvider', () => ({
  useCallSession: () => ({
    sipReason: null, currentNumber: '', status: 'idle',
    dispatch: vi.fn(), dial: vi.fn(), hangup: vi.fn(), openDialer: vi.fn(),
  }),
}));
vi.mock('@/hooks/communication/useCalls', () => ({
  useCalls: () => ({ addCallNotes: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('@/hooks/communication/useMediaElementVolume', () => ({ useMediaElementVolume: () => undefined }));
vi.mock('@/lib/calls/tabLeaderStore', () => ({ claimLeadership: vi.fn(), isLeader: () => true }));

const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });

describe('TelefoniaView (T33)', () => {
  it('renderiza o container do shell com o data-testid e as classes do aceite', () => {
    render(
      <QueryClientProvider client={cliente}>
        <TelefoniaView />
      </QueryClientProvider>,
    );
    const container = screen.getByTestId('tel-view');
    expect(container.className).toContain('flex');
    expect(container.className).toContain('flex-col');
    expect(container.className).toContain('gap-4');
    expect(container.className).toContain('min-w-0');
  });

  it('o alias VoIPPanel aponta para a mesma view (contrato dos 5 consumidores)', async () => {
    const alias = await import('../VoIPPanel');
    const direto = await import('../TelefoniaView');
    expect(alias.VoIPPanel).toBe(direto.TelefoniaView);
  });
});
vi.mock('@/hooks/calls/useCallsKpi', () => ({
  useCallsKpi: () => ({
    data: { total: 12, answered: 8, missed_inbound: 2, inbound: 9, outbound: 3, avg_talk_seconds: 190 },
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));

vi.mock('@/hooks/calls/useTelefoniaFilters', () => ({
  useTelefoniaFilters: () => ({
    filtros: { period: '7d', channel: 'all', dir: 'all', result: 'all', q: '', page: 1, scope: 'mine', call: '' },
    setFilter: () => {},
    limpar: () => {},
  }),
}));

vi.mock('@/hooks/calls/useCallChannels', () => ({
  useCallChannels: () => ({
    voip: { channel: 'voip', canDial: true, canReceive: true, canRecord: false, canReject: true, reason: null },
    whatsapp: { channel: 'whatsapp', canDial: false, canReceive: true, canRecord: false, canReject: false, reason: null },
    linhaWhatsApp: null, rotuloLinhaWhatsApp: '',
  }),
}));

// T34: o PageHeader le o LayoutContext (breadcrumbs) e estoura sem o provider. Mockar
// AQUI e o passo que faltou na primeira tentativa: sem isso, os 13 testes da view caiam.
vi.mock('@/components/layout/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title?: string; subtitle?: string }) => (
    <div data-testid="page-header">
      {title}
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  ),
}));

