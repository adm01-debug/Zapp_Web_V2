import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { IntegrationKeysSection } from '@/components/settings/IntegrationKeysSection';
import { toast } from 'sonner';

const settingsIniciais = [
  { id: 's1', key: 'elevenlabs_api_key', value: 'xi-chave-registrada', description: null },
];

async function salvarNovaChave() {
  const campo = await screen.findByPlaceholderText('Nova chave para substituir...');
  fireEvent.change(campo, { target: { value: 'xi-nova-chave' } });
  fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectAposUpsert.mockReturnValue({ single: mockSingle });
  mockOrder.mockResolvedValue({ data: settingsIniciais, error: null });
  mockSingle.mockResolvedValue({ data: settingsIniciais[0], error: null });
});

describe('IntegrationKeysSection — chave registrada não é a chave usada', () => {
  it('mostra que a autoridade efetiva é a variável de ambiente do servidor e não a chave salva', async () => {
    render(<IntegrationKeysSection />);

    expect(await screen.findByText(/não é a chave usada/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ELEVENLABS_API_KEY/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Chave para geração de voz (TTS), efeitos sonoros e conversão de voz')).not.toBeInTheDocument();
  });

  it('o badge não afirma uso efetivo da chave registrada', async () => {
    render(<IntegrationKeysSection />);

    expect(await screen.findByText('Registrada (não usada pelo TTS)')).toBeInTheDocument();
    expect(screen.queryByText('Configurada')).not.toBeInTheDocument();
  });

  it('não anuncia sucesso quando o salvamento falha', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'policy violation' } });

    render(<IntegrationKeysSection />);
    await salvarNovaChave();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Erro ao salvar chave');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('anuncia sucesso somente quando a persistência é aceita', async () => {
    render(<IntegrationKeysSection />);
    await salvarNovaChave();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Chave salva com sucesso');
    });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
