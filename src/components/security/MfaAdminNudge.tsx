import { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useHasVerifiedTotp } from '@/hooks/auth/useMFA';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';

const DISMISS_KEY = 'zapp:mfa-nudge-dismissed-at';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

interface MfaAdminNudgeProps {
  onNavigate: (viewId: string) => void;
}

// Soft gate: admin sem TOTP verificado ve um aviso persistente (dispensavel por 24h)
// apontando para a tela de seguranca. Nao bloqueia — com 2 admins e 0 fatores
// cadastrados, um hard gate trancaria o proprio mantenedor para fora.
export function MfaAdminNudge({ onNavigate }: MfaAdminNudgeProps) {
  const { isAdmin, loading } = useUserRole();
  const [dismissed, setDismissed] = useState(() => {
    const at = Number(safeGetItem(DISMISS_KEY) ?? 0);
    return Number.isFinite(at) && Date.now() - at < DISMISS_TTL_MS;
  });
  // undefined (carregando ou erro) = nao incomoda; so false mostra o aviso.
  const { data: hasMfa } = useHasVerifiedTotp(!loading && isAdmin && !dismissed);

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
            safeSetItem(DISMISS_KEY, String(Date.now()));
            setDismissed(true);
          }}
          className="rounded-md p-1 hover:bg-amber-500/20 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
