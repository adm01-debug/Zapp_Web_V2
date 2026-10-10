import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewConversationDialog } from '@/components/team-chat/NewConversationDialog';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'u1', name: 'User One' } }),
}));

vi.mock('@/hooks/crm/useTeamProfiles', () => ({
  useTeamProfiles: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/chat/useTeamChat', () => ({
  useCreateTeamConversation: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: 'conv-1' }),
    isPending: false,
  }),
}));

vi.mock('@/hooks/team-chat/useActiveDepartments', () => ({
  useActiveDepartments: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/teamChatRules', () => ({
  canCreateTeamConversation: () => true,
}));

describe('NewConversationDialog — substituição de Tabs por ToggleGroup (N-183)', () => {
  it('não tem aria-controls nos botões de alternância (sem painel prometido)', () => {
    render(<NewConversationDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    const botoes = screen.getAllByRole('radio');
    expect(botoes.every((b) => !b.hasAttribute('aria-controls'))).toBe(true);
  });

  it('usa role="radiogroup" e aria-checked para marcar o ativo', () => {
    render(<NewConversationDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    const grupo = screen.getByRole('radiogroup', { name: 'Tipo de conversa' });
    expect(grupo).toBeTruthy();
    const radios = grupo.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios[1].getAttribute('aria-checked')).toBe('false');
    expect(radios[2].getAttribute('aria-checked')).toBe('false');
  });

  it('troca de aba clicando e atualiza o conteúdo', () => {
    render(<NewConversationDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    const radios = screen.getAllByRole('radio');

    // Começa em "Direto"
    expect(radios[0].getAttribute('aria-checked')).toBe('true');

    // Clica em "Grupo"
    fireEvent.click(radios[1]);
    expect(radios[1].getAttribute('aria-checked')).toBe('true');
    expect(radios[0].getAttribute('aria-checked')).toBe('false');

    // Clica em "Depto"
    fireEvent.click(radios[2]);
    expect(radios[2].getAttribute('aria-checked')).toBe('true');
    expect(radios[1].getAttribute('aria-checked')).toBe('false');
  });

  it('cada botão tem aria-label acessível', () => {
    render(<NewConversationDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAccessibleName(/direto/i);
    expect(radios[1]).toHaveAccessibleName(/grupo/i);
    expect(radios[2]).toHaveAccessibleName(/depto/i);
  });
});