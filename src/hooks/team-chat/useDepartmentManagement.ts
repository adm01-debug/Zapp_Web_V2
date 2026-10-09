import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DepartmentProfile {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  is_active: boolean;
  department_id: string | null;
}

export interface DepartmentAuditLog {
  id: string;
  department_id: string;
  action: string;
  profile_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

/**
 * Convite no contrato ATUAL (`department_invitations`, migration 20260928500000/e14).
 * `status`/`use_count`/`max_uses` sao o que a tela precisa para distinguir convite
 * pendente, usado e esgotado (F76); a tabela aposentada `department_invites` nao e
 * mais lida nem escrita por este hook.
 */
export interface DepartmentInvite {
  id: string;
  department_id: string;
  code: string;
  created_by: string | null;
  expires_at: string;
  created_at: string;
  status: string;
  use_count: number;
  max_uses: number;
}

export interface DepartmentWhatsAppCredentials {
  mode: 'none' | 'evolution' | 'official';
  instance_id: string | null;
  has_api_key: boolean;
  /**
   * Campo do formulario ATUAL (`DepartmentWhatsAppView`, camada de tela): o rotulo
   * diz "URL da Evolution API", mas o contrato do banco guarda `departments.
   * whatsapp_instance_id` — nao existe coluna de URL. Por isso o valor que volta
   * aqui e o mesmo `instance_id`; o cartao de tela (F77) troca o rotulo/campo para
   * "Instance ID" e passa a ler `instance_id`.
   */
  evolution_url: string | null;
}

/**
 * Entrada aceita por `useSaveDepartmentWhatsApp`. A interface da RPC atual e
 * `(instance_id, api_key)`; os nomes antigos (`evolution_url`, `evolution_api_key`,
 * `official_token`) seguem aceitos porque o formulario de hoje ainda os envia — assim
 * nenhum valor digitado e descartado em silencio.
 */
export interface DepartmentWhatsAppConfigInput {
  instance_id?: string;
  api_key?: string;
  evolution_url?: string;
  evolution_api_key?: string;
  official_token?: string;
}

/** Resposta da RPC `create_department_invite` (migration 20260928520000). */
export interface CreatedDepartmentInvite {
  ok: true;
  invite_id: string;
  code: string;
}

/** Resposta da RPC `accept_department_invite` (migration 20260928510000). */
export interface AcceptedDepartmentInvite {
  ok: true;
  department_id: string;
}

const WHATSAPP_MODES = ['none', 'evolution', 'official'] as const;

/**
 * Uso e janela do convite criado pela RPC `create_department_invite`, que gera o
 * codigo no servidor (`gen_random_bytes`) e grava `department_invitations` +
 * auditoria na mesma transacao. Os valores preservam o comportamento anterior do
 * hook: uso unico e validade de 7 dias (a RPC tem defaults proprios: 1 uso / 72h).
 */
const INVITE_MAX_USES = 1;
const INVITE_EXPIRES_HOURS = 7 * 24;

/**
 * `get_department_whatsapp_config` existe no banco desde a migration 20261006213734
 * (F10) mas ainda nao esta em `src/integrations/supabase/types.ts`, arquivo fora do
 * escopo deste cartao. O cast local chama a MESMA RPC com o MESMO nome/parametro que
 * a migration declara, sem editar o arquivo de tipos gerado.
 */
const rpcForaDosTipos = supabase.rpc as unknown as (
  nome: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * A RPC de leitura `get_department_whatsapp_config` devolve uma TABELA
 * `(mode, instance_id, has_api_key)` — sem a chave. Devolver o payload cru deixava
 * `credentials.mode` indefinido e a tela nunca carregava o modo salvo (familia
 * TC-015: implementacao que nao corresponde ao contrato atual).
 */
export function toDepartmentWhatsAppCredentials(payload: unknown): DepartmentWhatsAppCredentials {
  const row = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> | null | undefined;
  if (!row) return { mode: 'none', instance_id: null, has_api_key: false, evolution_url: null };
  const raw = row.mode;
  const mode = (WHATSAPP_MODES as readonly string[]).includes(raw as string)
    ? (raw as DepartmentWhatsAppCredentials['mode'])
    : 'none';
  const instanceId = typeof row.instance_id === 'string' && row.instance_id !== '' ? row.instance_id : null;
  return { mode, instance_id: instanceId, has_api_key: row.has_api_key === true, evolution_url: instanceId };
}

export function useDepartmentProfiles() {
  return useQuery<DepartmentProfile[]>({
    queryKey: ['departmentChat', 'profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_profiles');
      if (error) throw error;
      return ((data ?? []) as DepartmentProfile[]).sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 30 * 1000,
  });
}

export function useDepartmentAuditLogs(departmentId: string) {
  return useQuery<DepartmentAuditLog[]>({
    queryKey: ['departmentChat', 'audit', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('department_audit_logs')
        .select('*')
        .eq('department_id', departmentId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) {
        if (error.code === '42P01') return [];
        throw error;
      }
      return (data ?? []) as DepartmentAuditLog[];
    },
    staleTime: 30 * 1000,
  });
}

export function useDepartmentInvites(departmentId: string) {
  return useQuery<DepartmentInvite[]>({
    queryKey: ['departmentChat', 'invites', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('department_invitations')
        .select('*')
        .eq('department_id', departmentId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DepartmentInvite[];
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Leitura da config de WhatsApp do departamento (F77). A RPC antiga
 * `get_department_whatsapp_credentials` e service_role-only (20260928550000) e devolvia
 * `access_denied` para `authenticated`; a atual e `get_department_whatsapp_config`
 * (20261006213734), admin/supervisor pela guarda canonica, e nunca devolve a chave.
 */
export function useDepartmentWhatsAppCredentials(departmentId: string) {
  return useQuery<DepartmentWhatsAppCredentials>({
    queryKey: ['departmentChat', 'whatsapp', departmentId],
    queryFn: async () => {
      const { data, error } = await rpcForaDosTipos('get_department_whatsapp_config', {
        p_department_id: departmentId,
      });
      if (error) throw error;
      return toDepartmentWhatsAppCredentials(data);
    },
    staleTime: 60 * 1000,
  });
}

export function useCreateDepartmentInvite(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    /**
     * `actorName` era usado no INSERT de auditoria feito pelo cliente; agora quem
     * audita e a propria RPC (SECURITY DEFINER grava `department_audit_logs` com o
     * perfil da sessao). O parametro continua na assinatura para nao quebrar o
     * chamador atual (`DepartmentInvitesView`).
     */
    mutationFn: async (_actorName?: string): Promise<CreatedDepartmentInvite> => {
      const { data, error } = await supabase.rpc('create_department_invite', {
        p_department_id: departmentId,
        p_max_uses: INVITE_MAX_USES,
        p_expires_hours: INVITE_EXPIRES_HOURS,
      });
      if (error) throw error;
      const result = (data ?? null) as {
        ok?: boolean;
        error?: string;
        invite_id?: string;
        code?: string;
      } | null;
      if (!result || result.ok !== true || !result.invite_id || !result.code) {
        throw new Error(result?.error ?? 'create_department_invite_failed');
      }
      return { ok: true, invite_id: result.invite_id, code: result.code };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'invites', departmentId] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
    },
  });
}

/**
 * "Revogar" convite (F76) e UPDATE de `status` em `department_invitations`: a policy
 * `department_invitations_admin_all` libera o UPDATE para admin/supervisor e o convite
 * sai das pendentes sem perder o rastro do que ja foi aceito. O INSERT direto em
 * `department_audit_logs` que existia aqui era revogado para `authenticated`
 * (20260928530000) e o verbo `delete_invite` nem existe no CHECK da tabela; `actorName`
 * fica na assinatura por compatibilidade com o chamador atual.
 */
export function useDeleteDepartmentInvite(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ inviteId }: { inviteId: string; actorName: string }) => {
      const { data, error } = await supabase
        .from('department_invitations')
        .update({ status: 'revoked' })
        .eq('id', inviteId)
        .select('id');
      if (error) throw error;
      // Zero linhas = a policy filtrou ou o convite nao existe: nao e sucesso.
      if (!data || data.length === 0) {
        throw new Error('department_invite_not_found_or_not_authorized');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'invites', departmentId] });
    },
  });
}

/**
 * "Entrar via Codigo" (F79). Quem aceita e a RPC SECURITY DEFINER
 * `accept_department_invite`, que valida `status`, `expires_at` e `use_count`, move o
 * perfil para o departamento e grava a auditoria na mesma transacao — o cliente nao
 * escreve em `profiles`. A RPC responde `ok: false` com o motivo tipado
 * (`invalid_or_expired_code`, `invite_exhausted`, `not_authenticated`) em vez de erro
 * PostgREST; o motivo viaja como mensagem do erro para a tela distinguir os casos.
 */
export function useAcceptDepartmentInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string): Promise<AcceptedDepartmentInvite> => {
      const { data, error } = await supabase.rpc('accept_department_invite', { p_code: code });
      if (error) throw error;
      const result = (data ?? null) as {
        ok?: boolean;
        error?: string;
        department_id?: string;
      } | null;
      if (!result || result.ok !== true || !result.department_id) {
        throw new Error(result?.error ?? 'invalid_or_expired_code');
      }
      return { ok: true, department_id: result.department_id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['team-conversations'] });
    },
  });
}

export function useAddDepartmentMember(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, profileName, actorName }: { profileId: string; profileName: string; actorName: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: departmentId })
        .eq('id', profileId);
      if (error) throw error;
      await supabase.from('department_audit_logs').insert({
        department_id: departmentId,
        action: 'add_member',
        profile_id: user?.id ?? null,
        details: { added_profile_id: profileId, profile_name: profileName, actor_name: actorName },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'profiles'] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
    },
  });
}

export function useRemoveDepartmentMember(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, profileName, actorName }: { profileId: string; profileName: string; actorName: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: null })
        .eq('id', profileId);
      if (error) throw error;
      await supabase.from('department_audit_logs').insert({
        department_id: departmentId,
        action: 'remove_member',
        profile_id: user?.id ?? null,
        details: { removed_profile_id: profileId, profile_name: profileName, actor_name: actorName },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'profiles'] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
    },
  });
}

/**
 * Salva a config de WhatsApp pela RPC `set_department_whatsapp_config`
 * (20260928540000 + guarda canonica/auditoria em 20261006213734). Substitui o upsert
 * em `department_whatsapp_configs` — tabela que nao existe no schema (era a unica
 * entrada do baseline de `known-violations.json`) — e o INSERT de auditoria no
 * cliente, revogado para `authenticated`. A chave vai em `p_api_key` e nunca volta
 * pelo GET; `p_api_key`/`p_instance_id` nulos preservam o valor ja gravado (COALESCE).
 */
export function useSaveDepartmentWhatsApp(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mode, config }: {
      mode: 'none' | 'evolution' | 'official';
      config: DepartmentWhatsAppConfigInput;
      actorName: string;
    }) => {
      const apiKey = config.api_key ?? config.evolution_api_key ?? config.official_token;
      const instanceId = config.instance_id ?? config.evolution_url;
      const { data, error } = await supabase.rpc('set_department_whatsapp_config', {
        p_department_id: departmentId,
        p_whatsapp_mode: mode,
        p_api_key: apiKey,
        p_instance_id: instanceId,
      });
      if (error) throw error;
      const result = (data ?? null) as { ok?: boolean; error?: string } | null;
      if (!result || result.ok !== true) {
        throw new Error(result?.error ?? 'set_department_whatsapp_config_failed');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'whatsapp', departmentId] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
    },
  });
}
