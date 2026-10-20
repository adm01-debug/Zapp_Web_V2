import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cartão "transferir conversa de departamento": o hook chama SÓ a RPC
 * `transfer_team_conversation_department` (nada de UPDATE direto em
 * `team_conversations.department_id`) e cada código de erro do banco vira um
 * aviso DIFERENTE na tela — o mesmo texto para os quatro casos esconderia de
 * quem está na tela qual foi o problema.
 */
const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  toast: vi.fn(),
  invalidateQueries: vi.fn(),
  captured: undefined as
    | undefined
    | {
        mutationFn: (vars: {
          conversationId: string;
          toDepartmentId: string;
        }) => Promise<unknown>;
        onSuccess?: (data: unknown, vars: unknown) => void;
        onError?: (error: unknown) => void;
      },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: f.rpc } }));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: f.toast }));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: { mutationFn: unknown }) => {
    f.captured = config as NonNullable<typeof f.captured>;
    return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: f.invalidateQueries }),
}));

import { useTransferConversationDepartment } from '@/hooks/team-chat/useTeamChatMutations';

const vars = { conversationId: 'conv-1', toDepartmentId: 'dept-2' };

const ERROS = [
  ['not_authorized', 'Sem permissão para transferir o departamento desta conversa'],
  ['not_a_department_conversation', 'Esta conversa não é de departamento'],
  ['conversation_not_found', 'Conversa não encontrada'],
  ['not_authenticated', 'Sessão expirada. Entre novamente para transferir o departamento'],
] as const;

describe('useTransferConversationDepartment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.captured = undefined;
    f.rpc.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it('muda o departamento pela RPC, com os nomes de parâmetro que o banco declara', async () => {
    renderHook(() => useTransferConversationDepartment());

    await expect(f.captured!.mutationFn(vars)).resolves.toEqual(vars);
    expect(f.rpc).toHaveBeenCalledWith('transfer_team_conversation_department', {
      p_conversation_id: 'conv-1',
      p_to_department_id: 'dept-2',
    });
  });

  it('no sucesso revalida as conversas da equipe (inbox) e avisa o usuário', async () => {
    renderHook(() => useTransferConversationDepartment());

    await f.captured!.mutationFn(vars);
    f.captured!.onSuccess?.({}, vars);

    expect(f.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['team-conversations'] });
    expect(f.toast).toHaveBeenCalledWith({ title: 'Departamento da conversa alterado' });
  });

  it('propaga o erro do banco (sem erro engolido)', async () => {
    f.rpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
    renderHook(() => useTransferConversationDepartment());

    await expect(f.captured!.mutationFn(vars)).rejects.toEqual({ message: 'not_authorized' });
  });

  it.each(ERROS)('o erro %s tem aviso próprio', (code, mensagem) => {
    renderHook(() => useTransferConversationDepartment());

    f.captured!.onError?.({ message: code });

    expect(f.toast).toHaveBeenCalledWith({ title: mensagem, variant: 'destructive' });
  });

  it('nenhum aviso de erro é igual a outro', () => {
    renderHook(() => useTransferConversationDepartment());
    const vistos = new Set<string>();

    for (const [code] of ERROS) {
      f.toast.mockClear();
      f.captured!.onError?.({ message: code });
      vistos.add((f.toast.mock.calls[0][0] as { title: string }).title);
    }

    expect(vistos.size).toBe(ERROS.length);
  });

  it('erro que o banco não nomeia cai no aviso genérico', () => {
    renderHook(() => useTransferConversationDepartment());

    f.captured!.onError?.({ message: 'boom' });

    expect(f.toast).toHaveBeenCalledWith({
      title: 'Erro ao transferir o departamento da conversa',
      variant: 'destructive',
    });
  });
});
