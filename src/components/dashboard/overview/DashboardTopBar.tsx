import { Bell, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';
import { getInitials, getAvatarColor } from '@/lib/avatar-colors';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { cn } from '@/lib/utils';

interface DashboardTopBarProps {
  unreadMessages: number;
}

/**
 * Não existe central de notificações no app — o sino abre a paleta de comandos
 * global, mesmo mecanismo de ContactsTopActions. AgentProfilePopover (sidebar)
 * exige estado (collapsed/onStatusChange/onViewChange/onLogout) que só o
 * Sidebar possui — reaproveitar aqui duplicaria essa lógica, então o chip de
 * usuário navega para Configurações (fallback previsto na etapa 20 do plano).
 */
export function DashboardTopBar({ unreadMessages }: DashboardTopBarProps) {
  const { profile } = useAuth();
  const name = profile?.name ?? 'Usuário';
  const { bg, text } = getAvatarColor(name);

  return (
    <div className="h-7 flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={() => document.dispatchEvent(new CustomEvent('open-command-palette'))}
        className="relative w-6 h-6 rounded-md flex items-center justify-center text-foreground-secondary hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="Notificações"
      >
        <Bell className="w-4 h-4" />
        {unreadMessages > 0 && (
          <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-dash-red" />
        )}
      </button>

      <button
        type="button"
        onClick={() => navigateToView('settings')}
        className="h-6 flex items-center gap-2 rounded-md px-1 hover:bg-muted/60 transition-colors"
        aria-label="Perfil"
      >
        <span className={cn('relative w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0', bg, text)}>
          {getInitials(name)}
          {profile?.is_active && (
            <span className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-success border border-background" />
          )}
        </span>
        <span className="text-[13px] font-medium text-foreground">{name}</span>
        <ChevronDown className="w-3 h-3 text-foreground-secondary" />
      </button>
    </div>
  );
}
