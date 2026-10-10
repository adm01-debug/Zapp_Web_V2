import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { InviteAgentDialog } from '../InviteAgentDialog';

// R2-API-022 (P1): o chamador do relay `send-email` deixa de enviar subject/html
// arbitrários. O convite agora manda só e-mail/nome/cargo, e o assunto/corpo
// derivam de um template do servidor. Este teste trava o formato do payload.

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }) },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { supabase } from '@/integrations/supabase/client';

describe('InviteAgentDialog — payload de convite vinculado ao template do servidor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia apenas email/nome/cargo (sem subject/html/cópias)', async () => {
    render(<InviteAgentDialog open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Nome do agente'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByPlaceholderText('agente@empresa.com'), { target: { value: 'ana@empresa.com' } });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);

    const [fnName, options] = vi.mocked(supabase.functions.invoke).mock.calls[0];
    expect(fnName).toBe('send-email');

    const body = (options as { body: Record<string, unknown> }).body;
    expect(body.email).toBe('ana@empresa.com');
    expect(body.name).toBe('Ana');
    expect(body.role).toBe('agent');

    for (const key of ['to', 'subject', 'html', 'text', 'cc', 'bcc', 'attachments', 'from', 'reply_to']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('não dispara o envio sem email preenchido', () => {
    render(<InviteAgentDialog open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Convite' }));

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
