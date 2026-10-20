import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AuthService } from '@/services/auth.service';

type SensitiveAction = 'change_password' | 'change_email' | 'configure_mfa' | 'admin_action' | 'delete_account';

/** Por que a reautenticação falhou. O diálogo mostra a mensagem certa em vez de 'Senha incorreta' para tudo. */
export type ReauthMotivo =
  | 'senha_incorreta'
  | 'conta_bloqueada'
  | 'indisponivel'
  | 'rede'
  | 'codigo_necessario'
  | 'codigo_incorreto';

export interface ReauthResult {
  success: boolean;
  error?: string;
  /** Só nas falhas: motivo classificado da recusa. */
  motivo?: ReauthMotivo;
  /**
   * A senha foi aceita (ou o código está em falta/errado) e a sessão tem TOTP
   * verificado: o diálogo precisa mostrar o campo do código do autenticador e
   * reenviar senha + código.
   */
  precisaCodigo?: boolean;
}

export interface ReauthOutcome {
  ok: boolean;
  motivo?: ReauthMotivo;
  /** Mensagem pt-BR pronta para o campo do diálogo; ausente quando ok. */
  mensagem?: string;
  /** Mesmo contrato de `ReauthResult.precisaCodigo`. */
  precisaCodigo?: boolean;
}

const MENSAGENS: Record<ReauthMotivo, string> = {
  senha_incorreta: 'Senha incorreta',
  conta_bloqueada: 'Conta temporariamente bloqueada. Tente novamente mais tarde.',
  indisponivel: 'Reautenticação temporariamente indisponível. Tente novamente em instantes.',
  rede: 'Não foi possível verificar agora. Confira sua conexão e tente novamente.',
  codigo_necessario: 'Digite o código de 6 dígitos do seu aplicativo autenticador.',
  codigo_incorreto: 'Código do autenticador incorreto. Confira o código e tente novamente.',
};

/** Código TOTP: 6 dígitos. Formato fora disso não vai para a rede. */
const CODIGO_MFA_RE = /^\d{6}$/;

/**
 * O segundo fator só é pedido quando ele realmente falta: fator TOTP verificado
 * E sessão ainda em AAL1. Sessão já em AAL2 segue intacta — a reautenticação em
 * modo `verify` não a rebaixa — e não há o que pedir.
 *
 * Falha FECHADA: se não for possível ler o nível de garantia (ou o fator
 * esperado não aparecer), devolve `error` e a reautenticação recusa. Nunca
 * "não deu para checar, então passo".
 */
async function fatorTotpPendente(): Promise<{ factorId?: string; error?: boolean }> {
  try {
    const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !assurance) return { error: true };

    if (assurance.currentLevel === 'aal2' || assurance.nextLevel !== 'aal2') return {};

    const { data: fatores, error: fatoresError } = await supabase.auth.mfa.listFactors();
    if (fatoresError || !fatores) return { error: true };

    const totp = (fatores.totp ?? []).find((f) => f.status === 'verified');
    // AAL2 devido sem fator verificado é estado inconsistente: falha fechada.
    return totp ? { factorId: totp.id } : { error: true };
  } catch {
    return { error: true };
  }
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

  const reauthenticate = async (password: string, codigo?: string): Promise<ReauthResult> => {
    setIsReauthenticating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.email) {
        return { success: false, error: 'Usuário não encontrado', motivo: 'indisponivel' };
      }

      // Reautentica pela edge `auth-login` em modo `verify` (lockout-aware,
      // ADR-006): a senha é conferida sem emitir sessão. O `signIn` antigo
      // trocava a sessão por um token AAL1, derrubando o AAL2 a cada ação
      // sensível — o usuário voltava para /2fa logo depois de reautenticar.
      const result = await AuthService.verifyPassword(user.email, password);

      if (result.error) {
        if (result.unavailable) {
          return { success: false, error: MENSAGENS.indisponivel, motivo: 'indisponivel' };
        }
        if (result.lock?.isLocked) {
          return { success: false, error: MENSAGENS.conta_bloqueada, motivo: 'conta_bloqueada' };
        }
        return { success: false, error: MENSAGENS.senha_incorreta, motivo: 'senha_incorreta' };
      }

      // Senha ok. Com TOTP verificado e a sessão em AAL1, o código eleva a
      // sessão CORRENTE para AAL2 (mfa.challenge + verify) — sem login novo.
      const fator = await fatorTotpPendente();
      if (fator.error) {
        return { success: false, error: MENSAGENS.indisponivel, motivo: 'indisponivel' };
      }

      if (fator.factorId) {
        const codigoLimpo = (codigo ?? '').trim();
        if (!CODIGO_MFA_RE.test(codigoLimpo)) {
          return {
            success: false,
            error: MENSAGENS.codigo_necessario,
            motivo: 'codigo_necessario',
            precisaCodigo: true,
          };
        }

        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: fator.factorId,
        });
        if (challengeError || !challenge?.id) {
          return {
            success: false,
            error: MENSAGENS.indisponivel,
            motivo: 'indisponivel',
            precisaCodigo: true,
          };
        }

        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: fator.factorId,
          challengeId: challenge.id,
          code: codigoLimpo,
        });
        if (verifyError) {
          return {
            success: false,
            error: MENSAGENS.codigo_incorreto,
            motivo: 'codigo_incorreto',
            precisaCodigo: true,
          };
        }
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

  const confirmReauth = async (password: string, codigo?: string): Promise<ReauthOutcome> => {
    const result = await reauthenticate(password, codigo);

    if (!result.success) {
      const motivo = result.motivo ?? 'senha_incorreta';
      return {
        ok: false,
        motivo,
        mensagem: result.error ?? MENSAGENS[motivo],
        precisaCodigo: result.precisaCodigo,
      };
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
