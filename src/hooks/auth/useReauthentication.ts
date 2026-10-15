import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AuthService } from '@/services/auth.service';

type SensitiveAction = 'change_password' | 'change_email' | 'configure_mfa' | 'admin_action' | 'delete_account';

/** Por que a reautenticação falhou. O diálogo mostra a mensagem certa em vez de 'Senha incorreta' para tudo. */
export type ReauthMotivo = 'senha_incorreta' | 'conta_bloqueada' | 'indisponivel' | 'rede';

export interface ReauthResult {
  success: boolean;
  error?: string;
  /** Só nas falhas: motivo classificado da recusa. */
  motivo?: ReauthMotivo;
}

export interface ReauthOutcome {
  ok: boolean;
  motivo?: ReauthMotivo;
  /** Mensagem pt-BR pronta para o campo do diálogo; ausente quando ok. */
  mensagem?: string;
}

const MENSAGENS: Record<ReauthMotivo, string> = {
  senha_incorreta: 'Senha incorreta',
  conta_bloqueada: 'Conta temporariamente bloqueada. Tente novamente mais tarde.',
  indisponivel: 'Reautenticação temporariamente indisponível. Tente novamente em instantes.',
  rede: 'Não foi possível verificar agora. Confira sua conexão e tente novamente.',
};

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
        return { success: false, error: 'Usuário não encontrado', motivo: 'indisponivel' };
      }

      // Re-authenticate through auth-login edge (lockout-aware, ADR-006)
      const result = await AuthService.signIn(user.email, password);

      if (result.error) {
        if (result.unavailable) {
          return { success: false, error: MENSAGENS.indisponivel, motivo: 'indisponivel' };
        }
        if (result.lock?.isLocked) {
          return { success: false, error: MENSAGENS.conta_bloqueada, motivo: 'conta_bloqueada' };
        }
        return { success: false, error: MENSAGENS.senha_incorreta, motivo: 'senha_incorreta' };
      }

      return { success: true };
    } catch {
      // getUser/setSession falhou (rede). Não vazar a mensagem crua do erro.
      return { success: false, error: MENSAGENS.rede, motivo: 'rede' };
    } finally {
      setIsReauthenticating(false);
    }
  };

  const requireReauth = (action: SensitiveAction, callback: () => Promise<void>) => {
    setPendingAction(action);
    setPendingCallback(() => callback);
    setShowReauthDialog(true);
  };

  const confirmReauth = async (password: string): Promise<ReauthOutcome> => {
    const result = await reauthenticate(password);

    if (!result.success) {
      const motivo = result.motivo ?? 'senha_incorreta';
      return { ok: false, motivo, mensagem: result.error ?? MENSAGENS[motivo] };
    }

    setShowReauthDialog(false);

    if (pendingCallback) {
      try {
        await pendingCallback();
        toast.success('Ação realizada com sucesso');
      } catch (error) {
        // Reautenticou: a falha aqui é da AÇÃO, não da senha. Um toast só; o
        // diálogo fecha e nunca mostra 'Senha incorreta'.
        const errorMessage = error instanceof Error ? error.message : 'Erro ao executar ação';
        toast.error(errorMessage);
      }
    }

    setPendingAction(null);
    setPendingCallback(null);
    return { ok: true };
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
