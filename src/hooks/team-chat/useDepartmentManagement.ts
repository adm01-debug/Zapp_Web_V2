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

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
    queryKey: ['departmentChat', 'whatsapp', departmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_department_whatsapp_credentials', { _department_id: departmentId });
      if (error) throw error;
      return (data as unknown as DepartmentWhatsAppCredentials) ?? { mode: 'none', evolution_url: null };
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
      qc.invalidateQueries({ queryKey: ['departmentChat', 'invites', departmentId] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
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
      qc.invalidateQueries({ queryKey: ['departmentChat', 'invites', departmentId] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
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

export function useSaveDepartmentWhatsApp(departmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mode, config, actorName }: {
      mode: 'none' | 'evolution' | 'official';
      config: { evolution_url?: string; evolution_api_key?: string; official_token?: string };
      actorName: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = { department_id: departmentId, mode };
      if (mode === 'evolution') {
        if (config.evolution_url) payload.evolution_url = config.evolution_url;
        if (config.evolution_api_key) payload.evolution_api_key = config.evolution_api_key;
      } else if (mode === 'official') {
        if (config.official_token) payload.official_token = config.official_token;
      }
      const { error } = await supabase
        // @ts-expect-error table not yet in generated types
        .from('department_whatsapp_configs')
        .upsert(payload, { onConflict: 'department_id' });
      if (error) throw error;
      await supabase.from('department_audit_logs').insert({
        department_id: departmentId,
        action: 'save_whatsapp',
        profile_id: user?.id ?? null,
        details: { mode, profile_name: actorName },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departmentChat', 'whatsapp', departmentId] });
      qc.invalidateQueries({ queryKey: ['departmentChat', 'audit', departmentId] });
    },
  });
}
