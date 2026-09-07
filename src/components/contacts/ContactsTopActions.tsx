import { Search, Bell } from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';
import { getInitials, getAvatarColor } from '@/lib/avatar-colors';
import { cn } from '@/lib/utils';

/**
 * Barra de ações do topo (busca global, notificações, avatar).
 * Não existe central de notificações no app — o sino abre a paleta de
 * comandos global (mesmo mecanismo do Cmd+K), de onde dá para navegar até
 * Configurações > Notificações. Ver divergência registrada no ledger da fase 3.
 */
export function ContactsTopActions() {
  const { profile } = useAuth();
  const name = profile?.name ?? 'Usuário';
  const { bg, text } = getAvatarColor(name);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={(e) => {
          document.dispatchEvent(new CustomEvent('open-global-search'));
          (e.currentTarget as HTMLButtonElement).blur();
        }}
        className="w-9 sm:w-[220px] h-9 rounded-xl bg-input border border-border text-[13px] text-muted-foreground hover:border-border/80 transition-colors flex items-center justify-center sm:justify-start gap-2 px-0 sm:px-3"
        aria-label="Buscar no sistema"
      >
        <Search className="w-[15px] h-[15px] shrink-0" />
        <span className="hidden sm:inline truncate">Buscar no sistema…</span>
      </button>

      <button
        type="button"
        onClick={() => document.dispatchEvent(new CustomEvent('open-command-palette'))}
        className="w-9 h-9 rounded-xl border border-border bg-card hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Notificações"
      >
        <Bell className="w-[18px] h-[18px]" />
      </button>

      <div
        className={cn('w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0', bg, text)}
        title={name}
        aria-label={`Usuário: ${name}`}
      >
        {getInitials(name)}
      </div>
    </div>
  );
}
