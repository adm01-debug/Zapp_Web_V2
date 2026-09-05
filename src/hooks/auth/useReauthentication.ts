import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AuthService } from '@/services/auth.service';

type SensitiveAction = 'change_password' | 'change_email' | 'configure_mfa' | 'admin_action' | 'delete_account';

interface ReauthResult {
  success: boolean;
  error?: string;
}

export function useReauthentication() {
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [showReauthDialog, setShowReauthDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<SensitiveAction | null>(null);
  const [pendingCallback, setPendingCallback] = useState<(() => Promise<void>) | null>(null);

  const reauthenticate = async (password: string): Promise<ReauthResult> => {
    setIsReauthenticating(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.email) {
        return { success: false, error: 'Usuário não encontrado' };
      }

      // Re-authenticate through auth-login edge (lockout-aware, ADR-006)
      const result = await AuthService.signIn(user.email, password);

      if (result.error) {
        return { success: false, error: 'Senha incorreta' };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro na re-autenticação';
      return { success: false, error: errorMessage };
    } finally {
      setIsReauthenticating(false);
    }
  };

  const requireReauth = (action: SensitiveAction, callback: () => Promise<void>) => {
    setPendingAction(action);
    setPendingCallback(() => callback);
    setShowReauthDialog(true);
  };

  const confirmReauth = async (password: string): Promise<boolean> => {
    const result = await reauthenticate(password);
    
    if (result.success) {
      setShowReauthDialog(false);
      
      if (pendingCallback) {
        try {
          await pendingCallback();
          toast.success('Ação realizada com sucesso');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro ao executar ação';
          toast.error(errorMessage);
          return false;
        }
      }
      
      setPendingAction(null);
      setPendingCallback(null);
      return true;
    } else {
      toast.error(result.error || 'Falha na re-autenticação');
      return false;
    }
  };

  const cancelReauth = () => {
    setShowReauthDialog(false);
    setPendingAction(null);
    setPendingCallback(null);
  };

  const getActionLabel = (action: SensitiveAction): string => {
    const labels: Record<SensitiveAction, string> = {
      change_password: 'Alterar Senha',
      change_email: 'Alterar Email',
      configure_mfa: 'Configurar MFA',
      admin_action: 'Ação Administrativa',
      delete_account: 'Excluir Conta',
    };
    return labels[action];
  };

  return {
    isReauthenticating,
    showReauthDialog,
    pendingAction,
    reauthenticate,
    requireReauth,
    confirmReauth,
    cancelReauth,
    getActionLabel,
  };
}
