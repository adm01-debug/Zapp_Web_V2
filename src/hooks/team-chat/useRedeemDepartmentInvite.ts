import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from './queryKeys';

/**
 * E83 — "Entrar via Código" (aceite desacoplado, sem tocar no TeamChatPanel).
 *
 * O agente que está fora do departamento digita o código do convite e entra no
 * canal sem recarregar. O caminho é a RPC canônica
 * `accept_department_invite(p_code text)` (SECURITY DEFINER; migration
 * 20260928510000/e15, regravada em 20261007012808), a ÚNICA porta para um
 * agente: a tabela `department_invitations` é admin-only por RLS
 * (`department_invitations_admin_all` = `is_admin_or_supervisor(auth.uid())`),
 * então um não-admin não lê o convite pelo cliente. A RPC resolve a identidade
 * com `current_profile_id()`, trava a linha (`FOR UPDATE`), valida status
 * 'pending'/expiração/teto de usos, grava `profiles.department_id` e a
 * auditoria no servidor.
 *
 * A RPC responde `{ok:true, department_id}` ou `{ok:false, error}` com
 * HTTP 200: a recusa tem de ser lida do corpo, senão passaria como sucesso. Os
 * códigos de erro são traduzidos para a mensagem da tela; um código
 * desconhecido (o banco pode acrescentar novos) cai na mensagem genérica.
 *
 * DESACOPLADO DE PROPÓSITO: este hook vive em módulo próprio e NÃO altera
 * `useDepartmentManagement.ts`. O diagnóstico ponta-a-ponta (ver PR2131) mostra
 * que a CRIAÇÃO grava na tabela legada `department_invites` enquanto o ACEITE
 * (esta RPC) lê `department_invitations` — o gap NÃO é corrigido aqui; só o
 * lado do aceite é entregue. A montagem no bloqueio "Conteúdo Protegido" do
 * `TeamChatPanel` é de outra PR (ver `EnterDepartmentByCode` + corpo da PR,
 * dependência da PR1987 que detém o painel).
 */
export const REDEEM_INVITE_ERROR_MESSAGES: Record<string, string> = {
  invalid_or_expired_code: 'Código inválido ou expirado',
  invite_exhausted: 'Este convite já atingiu o limite de usos',
  already_member: 'Você já é membro deste departamento',
  not_authenticated: 'Sessão expirada. Entre novamente.',
};

export function useRedeemDepartmentInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code }: { code: string }) => {
      const { data, error } = await supabase.rpc('accept_department_invite', {
        p_code: code.trim().toUpperCase(),
      });
      if (error) throw error;
      const result = (data ?? null) as unknown as
        { ok?: boolean; department_id?: string; error?: string } | null;
      if (!result?.ok) {
        const raw = result?.error ?? 'accept_department_invite_failed';
        throw new Error(
          REDEEM_INVITE_ERROR_MESSAGES[raw] ?? 'Não foi possível entrar com este código',
        );
      }
      return { departmentId: result.department_id ?? null };
    },
    onSuccess: () => {
      // O perfil é estado do AuthProvider (useAuth), não uma query do React Query:
      // quem reflete `department_id` na tela (`isChannelMember`) é o
      // `refreshProfile()` que o card chama quando a mutation resolve. Aqui
      // invalida-se o cache do React Query para o canal entrar no inbox.
      qc.invalidateQueries({ queryKey: queryKeys.inbox() });
      qc.invalidateQueries({ queryKey: queryKeys.departments.members() });
    },
  });
}
