import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockOrder = vi.hoisted(() => vi.fn());
const mockSelectAposUpdate = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => ({ select: mockSelectAposUpdate })));
const mockUpdate = vi.hoisted(() => vi.fn(() => ({ eq: mockEq })));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: mockOrder })),
      update: mockUpdate,
    })),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

vi.mock('@/components/settings/LanguageSelector', () => ({
  LanguageSelector: () => <div data-testid="language-selector" />,
}));

import { GlobalSettingsSection } from '@/components/settings/GlobalSettingsSection';
import { toast } from 'sonner';

const settingsIniciais = [
  { id: 's1', key: 'user_creation', value: 'enabled', description: null },
  { id: 's2', key: 'check_msg_is_group', value: 'disabled', description: null },
  { id: 's3', key: 'group_tickets_enabled', value: 'disabled', description: null },
  { id: 's4', key: 'auto_reopen_hours', value: '2', description: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockEq.mockReturnValue({ select: mockSelectAposUpdate });
  mockOrder.mockResolvedValue({ data: settingsIniciais, error: null });
  mockSelectAposUpdate.mockResolvedValue({ data: [{ key: 'user_creation' }], error: null });
});

describe('GlobalSettingsSection — configurações sem consumidor operacional', () => {
  it('se apresenta como configuração sem execução automática e sem descrições promissoras', async () => {
    render(<GlobalSettingsSection />);

    expect(await screen.findByText(/sem execução automática/i)).toBeInTheDocument();
    expect(screen.queryByText('Permite novos cadastros no sistema')).not.toBeInTheDocument();
    expect(screen.queryByText('Processar mensagens de grupos WhatsApp')).not.toBeInTheDocument();
    expect(screen.queryByText('Criar tickets automaticamente para grupos')).not.toBeInTheDocument();
    expect(screen.queryByText(/reabre a conversa automaticamente/i)).not.toBeInTheDocument();
  });

  it('não anuncia sucesso quando a escrita não atualiza nenhuma linha', async () => {
    mockSelectAposUpdate.mockResolvedValue({ data: [], error: null });

    render(<GlobalSettingsSection />);
    const interruptor = (await screen.findAllByRole('switch'))[0];
    fireEvent.click(interruptor);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('anuncia sucesso somente quando a escrita é aceita', async () => {
    render(<GlobalSettingsSection />);
    const interruptor = (await screen.findAllByRole('switch'))[0];
    fireEvent.click(interruptor);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Configuração atualizada');
    });
    expect(toast.error).not.toHaveBeenCalled();
  });
});
