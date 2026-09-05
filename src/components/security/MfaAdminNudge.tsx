import { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useHasVerifiedTotp } from '@/hooks/auth/useMFA';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';

const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;

// Chave por usuario: dois admins no mesmo navegador nao dispensam um pelo outro.
const dismissKey = (userId: string) => `zapp:mfa-nudge-dismissed-until:${userId}`;

function readDismissedUntil(userId: string | undefined): number {
  if (!userId) return 0;
  const until = Number(safeGetItem(dismissKey(userId)) ?? 0);
  return Number.isFinite(until) && until > Date.now() ? until : 0;
}

interface MfaAdminNudgeProps {
  onNavigate: (viewId: string) => void;
}

// Soft gate: admin sem TOTP verificado ve um aviso persistente (dispensavel por 24h)
// apontando para a tela de seguranca. Nao bloqueia — com 2 admins e 0 fatores
// cadastrados, um hard gate trancaria o proprio mantenedor para fora.
export function MfaAdminNudge({ onNavigate }: MfaAdminNudgeProps) {
  const { user } = useAuth();
  const userId = user?.id;
  const { isAdmin, loading } = useUserRole();
  // Troca de conta remonta a arvore (Index volta ao splash sem user), entao ler uma vez basta.
  const [dismissedUntil, setDismissedUntil] = useState(() => readDismissedUntil(userId));

  // O aviso volta sozinho quando as 24h vencem com a aba aberta.
  useEffect(() => {
    if (!dismissedUntil) return;
    const wait = Math.min(Math.max(dismissedUntil - Date.now(), 0), MAX_TIMEOUT_MS);
    const t = setTimeout(() => setDismissedUntil(0), wait);
    return () => clearTimeout(t);
  }, [dismissedUntil]);

  const dismissed = dismissedUntil > 0;
  // undefined (carregando ou erro) = nao incomoda; so false mostra o aviso.
  const { data: hasMfa } = useHasVerifiedTotp(!loading && isAdmin && !dismissed && !!userId);

  if (loading || !isAdmin || hasMfa !== false || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[80] w-[min(40rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-amber-500/40 bg-amber-50 text-amber-950 shadow-lg dark:bg-amber-950/90 dark:text-amber-50"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
        <p className="flex-1 text-sm">
          <span className="font-semibold">Sua conta é administradora e não tem 2FA.</span>{' '}
          Ative um app autenticador para proteger o acesso ao sistema.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('security')}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
        >
          Ativar 2FA
        </button>
        <button
          type="button"
          aria-label="Dispensar por 24 horas"
          onClick={() => {
            const until = Date.now() + DISMISS_TTL_MS;
            if (userId) safeSetItem(dismissKey(userId), String(until));
            setDismissedUntil(until);
          }}
          className="rounded-md p-1 hover:bg-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
