import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TeamConversation } from '@/hooks/team-chat/teamChatTypes';

/**
 * Cartão "mover conversa de departamento" — o diálogo do V2.
 * O de propriedade do grupo (`TransferConversationDialog`) é outra coisa e não
 * é tocado aqui; o que se prova: o departamento ATUAL fica desabilitado e
 * marcado, o sucesso fecha, e o erro do banco MANTÉM o diálogo aberto com o
 * aviso visível (fechar no erro esconderia o motivo).
 */
const mocks = vi.hoisted(() => ({
  departamentos: { data: [] as { id: string; name: string; is_active: boolean }[], isLoading: false },
  mutateAsync: vi.fn(),
  isPending: false,
}));

vi.mock('@/hooks/team-chat/useActiveDepartments', () => ({
  useActiveDepartments: () => ({ data: mocks.departamentos.data, isLoading: mocks.departamentos.isLoading }),
}));

vi.mock('@/hooks/team-chat/useTeamChatMutations', () => ({
  useTransferConversationDepartment: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: mocks.isPending,
  }),
}));

// Radix DropdownMenu não abre de forma confiável sob jsdom+fireEvent (mesmo
// padrão de ChatPanelHeader.test.tsx): o conteúdo fica sempre "aberto" para os
// itens do menu serem conferidos.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

import { MoveDepartmentDialog } from '@/components/team-chat/MoveDepartmentDialog';
import { TeamChatHeader } from '@/components/team-chat/TeamChatHeader';
import { TooltipProvider } from '@/components/ui/tooltip';

const conversa = {
  id: 'conv-1',
  type: 'department',
  name: 'Canal Financeiro',
  avatar_url: null,
  created_by: 'u1',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  department_id: 'dep-atual',
  members: [],
} as unknown as TeamConversation;

const departamentos = [
  { id: 'dep-atual', name: 'Financeiro', is_active: true },
  { id: 'dep-2', name: 'Comercial', is_active: true },
  { id: 'dep-3', name: 'Suporte', is_active: true },
];

describe('MoveDepartmentDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPending = false;
    mocks.departamentos = { data: departamentos, isLoading: false };
    mocks.mutateAsync.mockResolvedValue({ ok: true });
  });

  it('marca como desabilitado o departamento ATUAL e deixa os outros escolhíveis', () => {
    render(<MoveDepartmentDialog open onOpenChange={() => {}} conversation={conversa} />);

    const atual = screen.getByRole('option', { name: 'Financeiro — departamento atual' });
    expect(atual.hasAttribute('disabled')).toBe(true);
    expect(atual.getAttribute('aria-disabled')).toBe('true');

    const destino = screen.getByRole('option', { name: 'Comercial' });
    expect(destino.hasAttribute('disabled')).toBe(false);
    expect(atual.getAttribute('aria-selected')).toBe('false');
  });

  it('não deixa confirmar sem escolher destino (o botão fica desabilitado)', () => {
    render(<MoveDepartmentDialog open onOpenChange={() => {}} conversation={conversa} />);

    expect(screen.getByRole('button', { name: 'Mover' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('option', { name: 'Suporte' }));
    expect(screen.getByRole('button', { name: 'Mover' }).hasAttribute('disabled')).toBe(false);
  });

  it('no sucesso chama a RPC do hook e fecha o diálogo', async () => {
    const onOpenChange = vi.fn();
    render(<MoveDepartmentDialog open onOpenChange={onOpenChange} conversation={conversa} />);

    fireEvent.click(screen.getByRole('option', { name: 'Comercial' }));
    expect(screen.getByRole('option', { name: 'Comercial' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Mover' }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        toDepartmentId: 'dep-2',
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('mostra o estado de carregando enquanto a lista de departamentos não chegou', () => {
    mocks.departamentos = { data: [], isLoading: true };
    render(<MoveDepartmentDialog open onOpenChange={() => {}} conversation={conversa} />);

    expect(screen.getByText(/carregando departamentos/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mover' }).hasAttribute('disabled')).toBe(true);
  });

  it('mostra o estado vazio quando não há departamento ativo', () => {
    mocks.departamentos = { data: [], isLoading: false };
    render(<MoveDepartmentDialog open onOpenChange={() => {}} conversation={conversa} />);

    expect(screen.getByText(/nenhum departamento disponível/i)).toBeTruthy();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('no erro do banco MANTÉM o diálogo aberto e mostra o aviso', async () => {
    const onOpenChange = vi.fn();
    mocks.mutateAsync.mockRejectedValue({ message: 'not_authorized' });
    render(<MoveDepartmentDialog open onOpenChange={onOpenChange} conversation={conversa} />);

    fireEvent.click(screen.getByRole('option', { name: 'Suporte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover' }));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/não foi possível mover a conversa de departamento/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('TeamChatHeader — entrada do menu', () => {
  const headerProps = {
    conversation: conversa,
    voiceId: 'v1',
    speed: 1,
    showSearch: false,
    onBack: vi.fn(),
    onToggleSearch: vi.fn(),
    onAddMembers: vi.fn(),
    onVoiceChange: vi.fn(),
    onSpeedChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPending = false;
    mocks.departamentos = { data: departamentos, isLoading: false };
    mocks.mutateAsync.mockResolvedValue({ ok: true });
  });

  it('não oferece "Mover para outro departamento" para quem não pode transferir', () => {
    render(
      <TooltipProvider>
        <TeamChatHeader {...headerProps} canTransferDepartment={false} />
      </TooltipProvider>,
    );

    expect(screen.queryByRole('button', { name: /mover para outro departamento/i })).toBeNull();
  });

  it('oferece o item para quem pode e ele abre o diálogo', () => {
    render(
      <TooltipProvider>
        <TeamChatHeader {...headerProps} canTransferDepartment />
      </TooltipProvider>,
    );

    const item = screen.getByRole('button', { name: /mover para outro departamento/i });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(item);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('listbox', { name: 'Departamentos de destino' })).toBeTruthy();
  });
});
