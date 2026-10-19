import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';

const mockOrder = vi.hoisted(() => vi.fn());
const mockSingle = vi.hoisted(() => vi.fn());
const mockSelectAposUpsert = vi.hoisted(() => vi.fn(() => ({ single: mockSingle })));
const mockUpsert = vi.hoisted(() => vi.fn(() => ({ select: mockSelectAposUpsert })));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: mockOrder })),
      upsert: mockUpsert,
    })),
  },
}));

const roleState = vi.hoisted(() => ({
  isAdmin: true,
  isSupervisor: true,
  loading: false,
}));
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => roleState }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })} , getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }), createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),}));

import { IntegrationKeysSection } from '@/components/settings/IntegrationKeysSection';
import { toast } from 'sonner';

const CHAVE_REGISTRADA = 'xi-chave-registrada';

/**
 * A tela lê as configurações globais pelo hook, que agora vive no cache do React
 * Query: ela precisa do mesmo provider que o AppProviders monta na aplicação.
 */
function renderizar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<IntegrationKeysSection />, { wrapper });
}

const settingsIniciais = [
  {
    id: 's1',
    key: 'elevenlabs_api_key',
    value: CHAVE_REGISTRADA,
    description: null,
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-10-01T12:00:00.000Z',
  },
];

async function salvarNovaChave() {
  const campo = await screen.findByPlaceholderText('Nova chave para substituir...');
  fireEvent.change(campo, { target: { value: 'xi-nova-chave' } });
  fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  roleState.isAdmin = true;
  roleState.isSupervisor = true;
  roleState.loading = false;
  mockSelectAposUpsert.mockReturnValue({ single: mockSingle });
  mockOrder.mockResolvedValue({ data: settingsIniciais, error: null });
  mockSingle.mockResolvedValue({ data: settingsIniciais[0], error: null });
});

describe('IntegrationKeysSection — chave registrada não é a chave usada', () => {
  it('mostra que a autoridade efetiva é a variável de ambiente do servidor e não a chave salva', async () => {
    renderizar();

    expect(await screen.findByText(/não é a chave usada/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ELEVENLABS_API_KEY/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Chave para geração de voz (TTS), efeitos sonoros e conversão de voz')).not.toBeInTheDocument();
  });

  it('o badge não afirma uso efetivo da chave registrada', async () => {
    renderizar();

    expect(await screen.findByText('Registrada (não usada pelo TTS)')).toBeInTheDocument();
    expect(screen.queryByText('Configurada')).not.toBeInTheDocument();
  });

  it('não anuncia sucesso quando o salvamento falha', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'policy violation' } });

    renderizar();
    await salvarNovaChave();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Erro ao salvar chave');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('anuncia sucesso somente quando a persistência é aceita', async () => {
    renderizar();
    await salvarNovaChave();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Chave salva com sucesso');
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('o botão olho alterna aria-label entre "Mostrar chave" e "Ocultar chave" com aria-pressed', async () => {
    renderizar();

    const { container } = render(<IntegrationKeysSection />);

    await waitFor(() => {
      expect(mockOrder).toHaveBeenCalled();
    });
    expect(screen.queryByText('Chaves de Integração')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Nova chave para substituir...')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('o admin não tem botão para revelar o valor e o segredo não vai para a tela', async () => {
    render(<IntegrationKeysSection />);

    expect(await screen.findByText(/Registrada \(não usada pelo TTS\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mostrar chave/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ocultar chave/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/visib/i)).not.toBeInTheDocument();

    const html = document.body.innerHTML;
    expect(html).not.toContain(CHAVE_REGISTRADA);
    expect(screen.queryByDisplayValue(CHAVE_REGISTRADA)).not.toBeInTheDocument();
  });

  it('o admin vê a data em que a chave foi registrada e segue podendo substituí-la', async () => {
    render(<IntegrationKeysSection />);

    const registrada = await screen.findByTestId('chave-elevenlabs_api_key-registrada');
    expect(registrada).toHaveTextContent('Configurada em 01/10/2026');
    expect(registrada).not.toHaveTextContent(CHAVE_REGISTRADA);

    const campo = screen.getByPlaceholderText('Nova chave para substituir...');
    expect(campo).toHaveAttribute('type', 'password');
    fireEvent.change(campo, { target: { value: 'xi-nova-chave' } });
    expect(screen.getByRole('button', { name: /salvar/i })).toBeEnabled();
  });

  it('axe não aponta violações no botão olho', async () => {
    renderizar();
    const botaoOlho = await screen.findByRole('button', { name: /^Mostrar chave ElevenLabs API Key$/i });
    const results = await axe(botaoOlho);
    expect(results).toHaveNoViolations();
  });
});
