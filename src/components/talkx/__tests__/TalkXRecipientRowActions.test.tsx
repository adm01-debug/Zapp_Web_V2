import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TalkXRecipientRowActions } from '../tracking/TalkXRecipientRowActions';
import type { TalkXRecipient } from '@/hooks/integrations/useTalkX';
import { supabase } from '@/lib/supabaseHelpers';

vi.mock('@/lib/supabaseHelpers', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const baseRecipient: TalkXRecipient = {
  id: 'r1',
  campaign_id: 'c1',
  contact_id: 'ct1',
  personalized_message: 'Oi',
  status: 'failed',
  sent_at: '2026-01-01T10:00:00Z',
  delivered_at: null,
  error_message: 'timeout',
  manual_retry_count: 0,
  created_at: '2026-01-01T09:00:00Z',
  contacts: { name: 'João', phone: '+5511999999999', nickname: null, company: null, avatar_url: null },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TalkXRecipientRowActions', () => {
  it('renderiza "Abrir conversa" para todo destinatário', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    expect(screen.getByRole('button', { name: /abrir conversa/i })).toBeInTheDocument();
  });

  it('renderiza "Reenviar" quando status=failed e manual_retry_count < 3', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    expect(screen.getByRole('button', { name: /reenviar/i })).toBeInTheDocument();
  });

  it('NÃO renderiza "Reenviar" quando manual_retry_count >= 3', () => {
    const recipient = { ...baseRecipient, manual_retry_count: 3 };
    wrap(<TalkXRecipientRowActions recipient={recipient} />);
    expect(screen.queryByRole('button', { name: /reenviar/i })).not.toBeInTheDocument();
  });

  it('NÃO renderiza "Reenviar" quando status=delivered', () => {
    const recipient = { ...baseRecipient, status: 'delivered' };
    wrap(<TalkXRecipientRowActions recipient={recipient} />);
    expect(screen.queryByRole('button', { name: /reenviar/i })).not.toBeInTheDocument();
  });

  it('renderiza "Bloquear" para todo destinatário', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    expect(screen.getByRole('button', { name: /bloquear/i })).toBeInTheDocument();
  });

  it('clicar "Bloquear" abre diálogo de confirmação', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    fireEvent.click(screen.getByRole('button', { name: /bloquear/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/bloquear contato/i)).toBeInTheDocument();
  });

  it('clicar "Cancelar" no diálogo de bloqueio fecha o diálogo', () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    fireEvent.click(screen.getByRole('button', { name: /bloquear/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('clicar "Abrir conversa" dispara o evento open-contact-chat', () => {
    const dispatch = vi.fn();
    vi.spyOn(window, 'dispatchEvent').mockImplementation(dispatch);
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} />);
    fireEvent.click(screen.getByRole('button', { name: /abrir conversa/i }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'open-contact-chat',
        detail: { contactId: 'ct1' },
      }),
    );
  });

  it('ao confirmar bloqueio, chama talkx_suppress_contact RPC', async () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /bloquear/i }));
    fireEvent.click(screen.getByRole('button', { name: /bloquear/i }));

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('talkx_suppress_contact', expect.any(Object)));
  });

  it('ao clicar "Reenviar", chama retry_talkx_recipients RPC', async () => {
    wrap(<TalkXRecipientRowActions recipient={baseRecipient} onActionDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /reenviar/i }));

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('retry_talkx_recipients', expect.any(Object)));
  });
});