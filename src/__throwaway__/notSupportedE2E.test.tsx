/** THROWAWAY (não commitar): notSupported da Edge → callApi real → toast.warning na tela. */
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: h.toast }));
vi.mock('@/integrations/supabase/client', () => {
  const result = { data: [{ id: 'c1', name: 'Principal', instance_id: 'PRINCIPAL' }], error: null };
  const query: any = {
    eq: () => query,
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
  };
  return { supabase: { functions: { invoke: h.invoke }, from: () => ({ select: () => ({ order: () => query }) }) } };
});

import { PresenceTabContent } from '@/components/connections/InstancePresenceTab';
import { JoinGroupByInviteDialog, GroupEphemeralDialog } from '@/components/groups/GroupEvolutionDialogs';
import { SendTemplateDialog } from '@/components/catalog/SendTemplateDialog';

const ns = (action: string) => ({ data: { success: false, notSupported: true, message: `${action} não é suportado na Evolution GO.` }, error: null });
function render(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); });

describe('E2E notSupported', () => {
  it('presença', async () => {
    h.invoke.mockResolvedValue(ns('set-presence'));
    render(<PresenceTabContent instanceName="PRINCIPAL" />);
    fireEvent.click(screen.getByRole('button', { name: /aplicar presença/i }));
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledWith('A troca de presença não está disponível nesta conexão do WhatsApp (Evolution GO).'));
    expect(h.invoke.mock.calls[0][0]).toBe('evolution-api/set-presence');
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it('convite: invite-info notSupported libera accept-invite', async () => {
    h.invoke.mockImplementation((fn: string) => Promise.resolve(fn.endsWith('invite-info') ? ns('invite-info') : { data: { ok: true }, error: null }));
    const onJoined = vi.fn();
    render(<JoinGroupByInviteDialog open onOpenChange={vi.fn()} connections={[{ id: 'c1', name: 'Principal', instance_id: 'PRINCIPAL' } as any]} onJoined={onJoined} />);
    fireEvent.change(screen.getByLabelText(/link ou código/i), { target: { value: 'https://chat.whatsapp.com/AbC123' } });
    fireEvent.click(screen.getByRole('button', { name: /ver convite/i }));
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledWith('A prévia do convite não está disponível nesta conexão do WhatsApp (Evolution GO).'));
    expect(h.toast.error).not.toHaveBeenCalled();
    const entrar = screen.getByRole('button', { name: /entrar no grupo/i });
    expect(entrar).not.toBeDisabled();
    fireEvent.click(entrar);
    await waitFor(() => expect(onJoined).toHaveBeenCalled());
    expect(h.invoke.mock.calls.map((c) => c[0])).toEqual(['evolution-api/invite-info', 'evolution-api/accept-invite']);
    expect(h.toast.success).toHaveBeenCalledWith('Entrou no grupo');
  });

  it('temporárias', async () => {
    h.invoke.mockResolvedValue(ns('toggle-ephemeral'));
    render(<GroupEphemeralDialog open onOpenChange={vi.fn()} instanceName="PRINCIPAL" groupJid="1@g.us" groupName="G" />);
    const trigger = screen.getByRole('combobox', { name: 'Duração' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(screen.getAllByRole('option')[1]);
    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }));
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledWith('Mensagens temporárias não está disponível nesta conexão do WhatsApp (Evolution GO).'));
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it('template', async () => {
    h.invoke.mockResolvedValue(ns('send-template'));
    const t: any = { id: 't1', name: 'x', category: 'utility', language: 'pt_BR', content: 'Oi {{10}} {{2}}', variables: ['{{10}}', '{{2}}'], status: 'approved', whatsapp_connection_id: 'c1' };
    render(<SendTemplateDialog template={t} onOpenChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: /conexão/i })).toHaveTextContent('Principal'));
    fireEvent.change(screen.getByLabelText(/número do contato/i), { target: { value: '5511999999999' } });
    const vars = screen.getAllByLabelText(/variável/i);
    fireEvent.change(vars[0], { target: { value: 'DOIS' } });
    fireEvent.change(vars[1], { target: { value: 'DEZ' } });
    fireEvent.click(screen.getByRole('button', { name: /^enviar$/i }));
    await waitFor(() => expect(h.toast.warning).toHaveBeenCalledWith('O envio de template não está disponível nesta conexão do WhatsApp (Evolution GO).'));
    const body = h.invoke.mock.calls[0][1].body;
    expect(body.components[0].parameters.map((p: any) => p.text)).toEqual(['DOIS', 'DEZ']);
    expect(h.toast.error).not.toHaveBeenCalled();
  });
});
