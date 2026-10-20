import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMFA, useMfaFactors } from '@/hooks/auth/useMFA';
import { useReauthentication } from '@/hooks/auth/useReauthentication';

export type ReauthMode = 'password' | 'mfa';

interface ReauthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionLabel: string;
  /**
   * Confirma a identidade. `true` ou `null` = confirmado; `false` = erro
   * genérico; string = mensagem específica (lockout, indisponível, etc.).
   */
  onConfirm: (value: string) => Promise<boolean | string | null>;
  onCancel: () => void;
  isLoading?: boolean;
  /** `mfa` pede o código TOTP no lugar da senha (sessão com 2FA verificado). */
  mode?: ReauthMode;
}

export function ReauthDialog({
  open,
  onOpenChange,
  actionLabel,
  onConfirm,
  onCancel,
  isLoading = false,
  mode = 'password',
}: ReauthDialogProps) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Trava síncrona: um duplo clique no Confirmar não dispara a confirmação duas
  // vezes antes de o estado `submitting` refletir no DOM.
  const submittingRef = useRef(false);
  const isMfa = mode === 'mfa';
  const value = isMfa ? code : password;

  const handleConfirm = async () => {
    if (isMfa && code.length !== 6) {
      setError('Digite o código de 6 dígitos');
      return;
    }
    if (!isMfa && !password) {
      setError('Digite sua senha');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    setError('');
    try {
      const result = await onConfirm(value);

      if (result === true || result === null) {
        setPassword('');
        setCode('');
      } else {
        setError(
          typeof result === 'string' && result
            ? result
            : isMfa
              ? 'Código inválido'
              : 'Senha incorreta',
        );
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setCode('');
    setError('');
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mx-auto w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center mb-4"
          >
            <Shield className="w-8 h-8 text-warning" />
          </motion.div>
          <DialogTitle className="text-center">Confirmação de Segurança</DialogTitle>
          <DialogDescription className="text-center">
            Para realizar a ação <strong>{actionLabel}</strong>, confirme sua identidade{' '}
            {isMfa ? 'com o código do seu app autenticador.' : 'digitando sua senha.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            {isMfa ? (
              <>
                <Label htmlFor="reauth-code">Código de Verificação (2FA)</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="reauth-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => {
                      setError('');
                      setCode(e.target.value.replace(/\D/g, ''));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void handleConfirm();
                      }
                    }}
                    className="pl-10 text-center text-2xl tracking-widest font-mono"
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
              </>
            ) : (
              <>
                <Label htmlFor="reauth-password">Senha Atual</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="reauth-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void handleConfirm();
                      }
                    }}
                    className="pl-10 pr-10"
                    disabled={isLoading}
                    autoFocus
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </>
            )}
            {error && (
              <motion.p
                role="alert"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-destructive"
              >
                {error}
              </motion.p>
            )}
          </div>

          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <p>Esta verificação adicional protege sua conta contra acessos não autorizados.</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isLoading || submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || submitting || (isMfa ? code.length !== 6 : !password)}
          >
            {isLoading || submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verificando...
              </>
            ) : (
              'Confirmar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReauthGuardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionLabel: string;
  /** Executa só depois da identidade confirmada. */
  onConfirmed: () => void | Promise<void>;
}

/**
 * Portão de re-autenticação para ações destrutivas do Admin.
 *
 * Escolhe o método pela sessão (paridade V3 -> V2, t_5e689954):
 *  - com TOTP verificado, pede o CÓDIGO do app — o `mfa.challenge/verify`
 *    re-confirma a identidade SEM novo login, então o AAL2 da sessão não cai
 *    (o `AuthService.signIn` antigo devolvia um token aal1 e o gate de MFA
 *    mandava o usuário para /2fa no meio da ação);
 *  - sem 2FA, pede a senha pelo `useReauthentication` (lockout-aware).
 * Depois de confirmado, roda `onConfirmed` exatamente uma vez.
 */
export function ReauthGuard({ open, onOpenChange, actionLabel, onConfirmed }: ReauthGuardProps) {
  const { reauthenticate, isReauthenticating } = useReauthentication();
  const { data: factors, isLoading: factorsLoading } = useMfaFactors(true);
  const { verifyTOTP, loading: verifyingMfa } = useMFA();

  const verifiedFactor = (factors ?? []).find((f) => f.status === 'verified');

  const handleConfirm = async (value: string): Promise<string | null> => {
    if (verifiedFactor) {
      try {
        await verifyTOTP(verifiedFactor.id, value);
      } catch {
        return 'Código inválido';
      }
    } else {
      const result = await reauthenticate(value);
      if (!result.success) return result.error || 'Falha na re-autenticação';
    }

    try {
      await onConfirmed();
    } catch {
      return 'Não foi possível concluir a ação';
    }

    onOpenChange(false);
    return null;
  };

  return (
    <ReauthDialog
      open={open}
      onOpenChange={onOpenChange}
      actionLabel={actionLabel}
      mode={verifiedFactor ? 'mfa' : 'password'}
      onConfirm={handleConfirm}
      onCancel={() => onOpenChange(false)}
      isLoading={isReauthenticating || verifyingMfa || factorsLoading}
    />
  );
}
