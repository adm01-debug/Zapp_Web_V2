import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  email: string;
  created_by: string | null;
  expires_at: string;
  created_at: string;
  status: string;
  use_count: number;
  max_uses: number;
  used_at: string | null;
  used_by: string | null;
}

export interface DepartmentWhatsAppConfig {
  mode: 'none' | 'evolution' | 'official';
  instance_id: string | null;
  has_api_key: boolean;
}

async function getCurrentProfileId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;
  const { data } = await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle();
  return data?.id ?? null;
}

export function useDepartmentProfiles() {
  return useQuery<DepartmentProfile[]>({
    queryKey: ['departmentChat', 'profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url, is_active, department_id')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as DepartmentProfile[];
    },
    staleTime: 30 * 1000,
  });
}

export function useDepartmentAuditLogs(departmentId: string, enabled = true) {
  return useQuery<DepartmentAuditLog[]>({
    queryKey: ['departmentChat', 'audit', departmentId],
    enabled: enabled && !!departmentId,
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

export function useDepartmentInvites(departmentId: string, enabled = true) {
  return useQuery<DepartmentInvite[]>({
    queryKey: ['departmentChat', 'invites', departmentId],
    enabled: enabled && !!departmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('department_invitations')
        .select('*')
        .eq('department_id', departmentId)
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

export function useDepartmentWhatsAppConfig(departmentId: string, enabled = true) {
  return useQuery<DepartmentWhatsAppConfig>({
    queryKey: ['departmentChat', 'whatsapp', departmentId],
    enabled: enabled && !!departmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_department_whatsapp_credentials', { _department_id: departmentId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as unknown as DepartmentWhatsAppConfig) ?? { mode: 'none', instance_id: null, has_api_key: false };
    },
    staleTime: 60 * 1000,
  });
}

export function useCreateDepartmentInvite(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email = '', maxUses = 1, ttl = '7 days' }: { email?: string; maxUses?: number; ttl?: string } = {}) => {
      const { data, error } = await supabase.rpc('create_department_invite', {
        p_department_id: departmentId,
        p_email: email,
        p_max_uses: maxUses,
        p_ttl: ttl,
      });
      if (error) throw error;
      return data as { code: string; id: string } | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'invites', departmentId] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao criar convite: ${err.message}`);
    },
  });
}

export function useRevokeDepartmentInvite(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ inviteId }: { inviteId: string }) => {
      const profileId = await getCurrentProfileId();
      const { error } = await supabase
        .from('department_invitations')
        .update({ status: 'revoked' })
        .eq('id', inviteId);
      if (error) throw error;
      await supabase.from('department_audit_logs').insert({
        department_id: departmentId,
        action: 'invite_revoked',
        profile_id: profileId,
        details: { invite_id: inviteId },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'invites', departmentId] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao revogar convite: ${err.message}`);
    },
  });
}

export function useAddDepartmentMember(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, profileName }: { profileId: string; profileName: string }) => {
      const actorProfileId = await getCurrentProfileId();
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: departmentId })
        .eq('id', profileId);
      if (error) throw error;
      await supabase.from('department_audit_logs').insert({
        department_id: departmentId,
        action: 'member_added',
        profile_id: actorProfileId,
        details: { added_profile_id: profileId, profile_name: profileName },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'profiles'] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao adicionar membro: ${err.message}`);
    },
  });
}

export function useRemoveDepartmentMember(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ profileId, profileName }: { profileId: string; profileName: string }) => {
      const actorProfileId = await getCurrentProfileId();
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: null })
        .eq('id', profileId);
      if (error) throw error;
      await supabase.from('department_audit_logs').insert({
        department_id: departmentId,
        action: 'member_removed',
        profile_id: actorProfileId,
        details: { removed_profile_id: profileId, profile_name: profileName },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'profiles'] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao remover membro: ${err.message}`);
    },
  });
}

export function useRedeemDepartmentInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code }: { code: string }) => {
      const profileId = await getCurrentProfileId();
      if (!profileId) throw new Error('Não autenticado');

      const { data: invite, error: lookupError } = await supabase
        .from('department_invitations')
        .select('id, department_id, status, expires_at, use_count, max_uses')
        .eq('code', code.trim().toUpperCase())
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!invite) throw new Error('Código inválido ou não encontrado');
      if (invite.status !== 'active') throw new Error('Este convite não está mais ativo');
      if (new Date(invite.expires_at) < new Date()) throw new Error('Este convite expirou');
      if (invite.use_count >= invite.max_uses) throw new Error('Limite de usos atingido');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ department_id: invite.department_id })
        .eq('id', profileId);
      if (profileError) throw profileError;

      const newCount = invite.use_count + 1;
      await supabase
        .from('department_invitations')
        .update({
          use_count: newCount,
          status: newCount >= invite.max_uses ? 'used' : 'active',
          used_at: new Date().toISOString(),
          used_by: profileId,
        })
        .eq('id', invite.id);

      await supabase.from('department_audit_logs').insert({
        department_id: invite.department_id,
        action: 'invite_used',
        profile_id: profileId,
        details: { invite_id: invite.id, code },
      });

      return { departmentId: invite.department_id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'profiles'] });
      toast.success('Você entrou no canal do departamento!');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useSaveDepartmentWhatsApp(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mode, instanceId, apiKey }: {
      mode: 'none' | 'evolution' | 'official';
      instanceId?: string | null;
      apiKey?: string | null;
    }) => {
      const { error } = await supabase.rpc('set_department_whatsapp_config', {
        p_department_id: departmentId,
        p_mode: mode,
        p_instance_id: instanceId ?? null,
        p_api_key: apiKey ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'whatsapp', departmentId] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao salvar configuração WhatsApp: ${err.message}`);
    },
  });
}
