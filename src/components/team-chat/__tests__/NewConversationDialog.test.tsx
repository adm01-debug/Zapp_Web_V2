import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

    // Começa em "Direto": busca de colegas, sem campo de nome de grupo
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText('Buscar colegas')).toBeTruthy();
    expect(screen.queryByLabelText('Nome do grupo')).toBeNull();

    // Clica em "Grupo": marca o radio e mostra o campo exclusivo de grupo
    fireEvent.click(radios[1]);
    expect(screen.getAllByRole('radio')[1].getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('false');
    expect(screen.getByLabelText('Nome do grupo')).toBeTruthy();

    // Clica em "Depto": busca e lista passam a ser de departamentos
    fireEvent.click(screen.getAllByRole('radio')[2]);
    expect(screen.getAllByRole('radio')[2].getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('radio')[1].getAttribute('aria-checked')).toBe('false');
    expect(screen.getByLabelText('Buscar departamentos')).toBeTruthy();
    expect(screen.getByText('Nenhum departamento encontrado')).toBeTruthy();
  });

  it('cada botão tem aria-label acessível', () => {
    render(<NewConversationDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAccessibleName(/direto/i);
    expect(radios[1]).toHaveAccessibleName(/grupo/i);
    expect(radios[2]).toHaveAccessibleName(/depto/i);
  });

  it('busca e listas ficam fora do radiogroup (não são filhos do grupo)', () => {
    render(<NewConversationDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    const grupo = screen.getByRole('radiogroup', { name: 'Tipo de conversa' });
    expect(grupo.querySelector('input')).toBeNull();
    expect(grupo.querySelector('[role="listbox"]')).toBeNull();
    // ...mas continuam no diálogo
    expect(screen.getByLabelText('Buscar colegas')).toBeTruthy();
    expect(screen.getByRole('listbox', { name: 'Lista de colegas' })).toBeTruthy();
  });

  it('clicar no botão ativo não desmarca a aba (type=single desmarca sem guarda)', () => {
    render(<NewConversationDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    fireEvent.click(radios[0]);
    const depois = screen.getAllByRole('radio');
    expect(depois[0].getAttribute('aria-checked')).toBe('true');
    expect(depois[1].getAttribute('aria-checked')).toBe('false');
    expect(depois[2].getAttribute('aria-checked')).toBe('false');
  });

  it('funciona por teclado: ArrowRight move o foco, Space/Enter ativam', async () => {
    render(<NewConversationDialog open onOpenChange={() => {}} onCreated={() => {}} />);
    const radios = screen.getAllByRole('radio');
    act(() => {
      (radios[0] as HTMLElement).focus();
    });
    expect(document.activeElement).toBe(radios[0]);

    // Seta move o foco (Radix) sem trocar a seleção sozinha
    fireEvent.keyDown(radios[0], { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole('radio')[1]));
    expect(screen.getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true');

    // Space ativa o item focado (no navegador, Space/Enter num botão nativo
    // disparam click; o jsdom não sintetiza, então o teste dispara o click
    // no elemento focado após o evento de tecla, pelo caminho real do Radix)
    fireEvent.keyDown(document.activeElement!, { key: ' ' });
    fireEvent.keyUp(document.activeElement!, { key: ' ' });
    fireEvent.click(document.activeElement!);
    await waitFor(() =>
      expect(screen.getAllByRole('radio')[1].getAttribute('aria-checked')).toBe('true')
    );
    expect(screen.getByLabelText('Nome do grupo')).toBeTruthy();

    // Enter ativa o próximo item (o campo "Nome do grupo" tem autoFocus e rouba
    // o foco ao montar, como no navegador; o usuário de teclado volta ao grupo
    // com Tab — o teste refoca o radio atual antes da seta)
    act(() => {
      (screen.getAllByRole('radio')[1] as HTMLElement).focus();
    });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole('radio')[2]));
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    fireEvent.keyUp(document.activeElement!, { key: 'Enter' });
    fireEvent.click(document.activeElement!);
    await waitFor(() =>
      expect(screen.getAllByRole('radio')[2].getAttribute('aria-checked')).toBe('true')
    );
    expect(screen.getByLabelText('Buscar departamentos')).toBeTruthy();
  });
});
