import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BASE36_MAIUSCULO, secureRandomChars } from '../../lib/secureRandom';
import { queryKeys } from './queryKeys';

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

export interface DepartmentInvite {
  id: string;
  department_id: string;
  code: string;
  created_by: string | null;
  expires_at: string;
  created_at: string;
}

export interface DepartmentWhatsAppCredentials {
  mode: 'none' | 'evolution' | 'official';
  evolution_url: string | null;
}

const WHATSAPP_MODES = ['none', 'evolution', 'official'] as const;

/**
 * A RPC `get_department_whatsapp_mode` devolve TEXTO puro — so o modo salvo
 * (`none` | `evolution` | `official`), nunca a chave da API (a RPC irma de
 * credenciais e service_role-only e o usuario logado nao pode executa-la).
 * Qualquer valor fora do enum cai em 'none', inclusive o NULL de departamento
 * inexistente. A URL nao e exposta pela RPC — `evolution_url` fica sempre nulo
 * para o formulario nao preencher nada.
 */
export function toDepartmentWhatsAppMode(raw: unknown): DepartmentWhatsAppCredentials['mode'] {
  return (WHATSAPP_MODES as readonly string[]).includes(raw as string)
    ? (raw as DepartmentWhatsAppCredentials['mode'])
    : 'none';
}

/**
 * Codigo do convite de departamento — credencial: quem digita entra no departamento.
 * PRNG previsivel aqui e vulnerabilidade (typescript:S2245), nao enfeite.
 *
 * O formato e CONTRATO do banco: `department_invites.code` e `text NOT NULL
 * UNIQUE` (migration 20260927400000) e a RPC `accept_department_invite` procura
 * por `code = upper(trim(p_code))`. `secureRandomChars(8, BASE36_MAIUSCULO)`
 * sorteia 8 caracteres do MESMO alfabeto de 36 do codigo antigo
 * ('A-Z0-9'), sem vies de modulo — formato preservado byte a byte, agora sem
 * codigo adivinhavel.
 */
function generateInviteCode(): string {
  return secureRandomChars(8, BASE36_MAIUSCULO);
}

export function useDepartmentProfiles() {
  return useQuery<DepartmentProfile[]>({
    queryKey: queryKeys.departments.members(),
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
    queryKey: queryKeys.departments.audit(departmentId),
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
    queryKey: queryKeys.departments.invites(departmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('department_invites')
        .select('*')
        .eq('department_id', departmentId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) {
        if (error.code === '42P01') return [];
        throw error;
      }
      return (data ?? []) as DepartmentInvite[];
    },
    staleTime: 30 * 1000,
  });
}

export function useDepartmentWhatsAppCredentials(departmentId: string) {
  return useQuery<DepartmentWhatsAppCredentials>({
    queryKey: queryKeys.departments.whatsapp(departmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_department_whatsapp_mode', { p_department_id: departmentId });
      if (error) throw error;
      return { mode: toDepartmentWhatsAppMode(data), evolution_url: null };
    },
    staleTime: 60 * 1000,
  });
}

export function useCreateDepartmentInvite(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (actorName: string) => {
      const code = generateInviteCode();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: { user } } = await supabase.auth.getUser();
      const { error: inviteErr } = await supabase
        .from('department_invites')
        .insert({ department_id: departmentId, code, expires_at: expiresAt, created_by: user?.id ?? null });
      if (inviteErr) throw inviteErr;
      await supabase.from('department_audit_logs').insert({
        department_id: departmentId,
        action: 'create_invite',
        profile_id: user?.id ?? null,
        details: { code, profile_name: actorName },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.departments.invites(departmentId) });
      qc.invalidateQueries({ queryKey: queryKeys.departments.audit(departmentId) });
    },
  });
}

export function useDeleteDepartmentInvite(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ inviteId, actorName }: { inviteId: string; actorName: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('department_invites').delete().eq('id', inviteId);
      if (error) throw error;
      await supabase.from('department_audit_logs').insert({
        department_id: departmentId,
        action: 'delete_invite',
        profile_id: user?.id ?? null,
        details: { invite_id: inviteId, profile_name: actorName },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.departments.invites(departmentId) });
      qc.invalidateQueries({ queryKey: queryKeys.departments.audit(departmentId) });
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
      qc.invalidateQueries({ queryKey: queryKeys.departments.members() });
      qc.invalidateQueries({ queryKey: queryKeys.departments.audit(departmentId) });
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
      qc.invalidateQueries({ queryKey: queryKeys.departments.members() });
      qc.invalidateQueries({ queryKey: queryKeys.departments.audit(departmentId) });
    },
  });
}

/**
 * Grava o WhatsApp do departamento pela RPC canonica
 * `public.set_department_whatsapp_config(p_department_id, p_whatsapp_mode, p_api_key, p_instance_id)`
 * (migration 20261006213734; contrato de banco provado em
 * scripts/db-audit/team-chat-department-whatsapp-safe-config.test.sh).
 *
 * A tabela `department_whatsapp_configs` NAO existe: o catalogo (supabase/schema-catalog.json) so
 * lista `departments`, e o upsert direto que vivia aqui era a unica entrada do baseline do
 * supabase-usage-guard (scripts/db-audit/known-violations.json) — falhava sempre em runtime. A RPC
 * grava as colunas whatsapp_mode / whatsapp_api_key / whatsapp_instance_id de `departments`, decide
 * a permissao por `public.is_admin_or_supervisor(auth.uid())` e registra a auditoria
 * `whatsapp_updated` sem o segredo. Por isso o hook nao insere mais em `department_audit_logs`:
 * o verbo `save_whatsapp` nao existe no CHECK daquela tabela (seria recusado) e o ator da
 * auditoria e resolvido dentro da RPC.
 *
 * `p_api_key` ausente mantem a chave ja armazenada (COALESCE na RPC) — e o "em branco = manter
 * atual" do formulario. `evolution_url` nao tem coluna em `departments` nem parametro na RPC:
 * o campo continua aceito na assinatura da mutation (contrato com a tela) e nao e gravado.
 */
export function useSaveDepartmentWhatsApp(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mode, config }: {
      mode: 'none' | 'evolution' | 'official';
      config: { evolution_url?: string; evolution_api_key?: string; official_token?: string };
      actorName: string;
    }) => {
      const apiKey = mode === 'evolution'
        ? (config.evolution_api_key?.trim() || undefined)
        : mode === 'official'
          ? (config.official_token?.trim() || undefined)
          : undefined;
      const { data, error } = await supabase.rpc('set_department_whatsapp_config', {
        p_department_id: departmentId,
        p_whatsapp_mode: mode,
        p_api_key: apiKey,
      });
      if (error) throw error;
      // A RPC responde {ok:false, error} com HTTP 200: sem esta checagem a recusa
      // (not_authorized / invalid_mode / department_not_found) passaria como sucesso.
      const result = (data ?? null) as { ok?: boolean; error?: string } | null;
      if (!result?.ok) throw new Error(result?.error ?? 'save_department_whatsapp_failed');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.departments.whatsapp(departmentId) });
      qc.invalidateQueries({ queryKey: queryKeys.departments.audit(departmentId) });
    },
  });
}
