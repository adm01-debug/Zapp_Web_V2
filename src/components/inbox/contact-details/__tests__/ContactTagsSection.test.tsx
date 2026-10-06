import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Accordion } from '@/components/ui/accordion';
import { ContactTagsSection } from '../ContactTagsSection';
import { useContactQuickActions } from '@/hooks/inbox/useContactQuickActions';
import type { ConversationContact } from '@/types/chat';

const h = vi.hoisted(() => {
  const state = { error: null as { message: string } | null };
  const eq = vi.fn(() => Promise.resolve({ error: state.error }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  });
  return { state, eq, update, from, toast };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: h.from } }));
vi.mock('sonner', () => ({ toast: h.toast }));

const contact: ConversationContact = {
  id: 'c1',
  name: 'Maria Silva',
  phone: '+5511999999999',
  tags: ['Cliente', 'Raro'],
  conversation_status: 'open',
};

// Liga a seção ao hook real — é o hook quem persiste (uma escrita por ação).
function Harness() {
  const qa = useContactQuickActions(contact);
  return (
    <Accordion type="multiple" defaultValue={['tags']}>
      <ContactTagsSection tags={qa.tags} onAddTag={qa.addTag} onRemoveTag={qa.removeTag} />
    </Accordion>
  );
}

describe('ContactTagsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.error = null;
  });

  it('lista as tags do contato como chips', () => {
    render(<Harness />);
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('Raro')).toBeInTheDocument();
  });

  it('clicar no X de uma tag grava contacts.tags sem ela', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover tag Raro' }));
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ tags: ['Cliente'] }));
    expect(h.eq).toHaveBeenCalledWith('id', 'c1');
    await waitFor(() => expect(screen.queryByText('Raro')).not.toBeInTheDocument());
    expect(screen.getByText('Cliente')).toBeInTheDocument();
  });

  it('adicionar pelo input (Enter) grava contacts.tags preservando as existentes', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Nova tag'), { target: { value: 'Novo' } });
    fireEvent.keyDown(screen.getByLabelText('Nova tag'), { key: 'Enter' });
    await waitFor(() =>
      expect(h.update).toHaveBeenCalledWith({ tags: ['Cliente', 'Raro', 'Novo'] }),
    );
    await waitFor(() => expect(screen.getByText('Novo')).toBeInTheDocument());
  });

  it('erro do banco vira toast.error e o chip não sai da tela', async () => {
    h.state.error = { message: 'rls' };
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover tag Raro' }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(screen.getByText('Raro')).toBeInTheDocument();
  });
});
