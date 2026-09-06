import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UpdateProfileParams {
  display_name?: string;
  avatar_url?: string;
  phone?: string;
  email?: string;
  signature?: string;
  birthday?: string;
}

/**
 * Uses update_own_profile RPC (SECURITY DEFINER) instead of direct table update.
 * Prevents privilege escalation by only allowing safe field updates.
 */
export function useSecureProfileUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateProfileParams) => {
      const { data, error } = await supabase.rpc('update_own_profile', {
        p_display_name: params.display_name,
        p_avatar_url: params.avatar_url,
        p_phone: params.phone,
        p_email: params.email,
        p_signature: params.signature,
        p_birthday: params.birthday,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Perfil atualizado com sucesso');
    },
    onError: (err) => {
      toast.error(`Erro ao atualizar perfil: ${err.message}`);
    },
  });
}
